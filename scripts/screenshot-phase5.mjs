/* global window, indexedDB, document, HTMLInputElement, sessionStorage */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const demoJson = execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/fork-demo.ts', '--records-json'], {
  encoding: 'utf8',
  maxBuffer: 24 * 1024 * 1024,
});
const demo = JSON.parse(demoJson);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'inherit' });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4174');
      if (response.ok) { ready = true; break; }
    } catch { /* preview is starting */ }
    await delay(250);
  }
  if (!ready) throw new Error('Vite preview server did not start.');
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1480, height: 1040, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4174/#/aar', { waitUntil: 'networkidle0' });
    await page.evaluate(async ({ parent, fork }) => {
      const request = indexedDB.open('vajra', 2);
      const db = await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('trainees')) { const store = database.createObjectStore('trainees', { keyPath: 'id' }); store.createIndex('unitId', 'unitId'); }
          if (!database.objectStoreNames.contains('units')) database.createObjectStore('units', { keyPath: 'id' });
          if (!database.objectStoreNames.contains('sessions')) { const store = database.createObjectStore('sessions', { keyPath: 'id' }); store.createIndex('traineeId', 'traineeId'); store.createIndex('unitId', 'unitId'); store.createIndex('startedAt', 'startedAt'); }
          if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction(['trainees', 'units', 'sessions'], 'readwrite');
      transaction.objectStore('trainees').put({ id: parent.traineeId, callsign: 'PHASE 5.1', unitId: parent.unitId, createdAt: parent.startedAt });
      transaction.objectStore('units').put({ id: parent.unitId, name: 'Fork Verification', createdAt: parent.startedAt });
      transaction.objectStore('sessions').put(parent);
      transaction.objectStore('sessions').put(fork);
      await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
      db.close();
      window.dispatchEvent(new Event('vajra:data-changed'));
    }, { parent: demo.parent, fork: demo.holdFireFork });

    const outputDir = path.resolve('docs/screenshots');
    fs.mkdirSync(outputDir, { recursive: true });
    await page.goto(`http://127.0.0.1:4174/#/aar/session/${encodeURIComponent(demo.parent.id)}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.aar-key-moments');
    await page.waitForFunction(() => document.body.innerText.includes('Replay from 5 s before'));
    await page.evaluate((tick) => {
      const slider = document.querySelector('input[aria-label="Replay timeline"]');
      if (!slider) throw new Error('AAR replay timeline is missing.');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, String(tick));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }, demo.firstNeutralEngagement.tick);
    await delay(250);
    await page.screenshot({ path: path.join(outputDir, 'phase51-real-key-moments.png'), fullPage: true });
    console.log(`Screenshot saved: ${path.join(outputDir, 'phase51-real-key-moments.png')}`);

    await page.evaluate(({ parentId, label, tick, sessionLog }) => {
      sessionStorage.setItem('vajra:pending-fork', JSON.stringify({
        parentId,
        parentLabel: label,
        traineeId: 'phase51-trainee',
        unitId: 'phase51-unit',
        tick,
        sessionLog,
      }));
    }, { parentId: demo.parent.id, label: `${demo.parent.scenarioKey} · ${demo.parent.seed}`, tick: demo.forkTick, sessionLog: demo.parent.sessionLog });
    await page.goto('http://127.0.0.1:4174/#/fork', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.fork-practice-banner');
    await page.waitForFunction(() => document.body.innerText.includes('DAWN INTRUSION'));
    await page.screenshot({ path: path.join(outputDir, 'phase51-real-fork-banner.png'), fullPage: true });
    console.log(`Screenshot saved: ${path.join(outputDir, 'phase51-real-fork-banner.png')}`);

    await page.goto(`http://127.0.0.1:4174/#/aar/compare/${encodeURIComponent(demo.parent.id)}/${encodeURIComponent(demo.holdFireFork.id)}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.aar-compare-narrative');
    await page.waitForFunction(() => document.body.innerText.includes('Engaged civilian quadcopter: -25'));
    await page.screenshot({ path: path.join(outputDir, 'phase51-real-compare.png'), fullPage: true });
    console.log(`Screenshot saved: ${path.join(outputDir, 'phase51-real-compare.png')}`);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
