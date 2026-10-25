/* global indexedDB, window, document, HTMLInputElement */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer-core';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'inherit' });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4174');
      if (response.ok) { ready = true; break; }
    } catch { /* server is starting */ }
    await delay(250);
  }
  if (!ready) throw new Error('Vite preview server did not start.');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1080, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4174/#/aar', { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      const open = indexedDB.open('vajra', 1);
      const db = await new Promise((resolve, reject) => {
        open.onupgradeneeded = () => {
          const database = open.result;
          const trainees = database.createObjectStore('trainees', { keyPath: 'id' }); trainees.createIndex('unitId', 'unitId');
          database.createObjectStore('units', { keyPath: 'id' });
          const sessions = database.createObjectStore('sessions', { keyPath: 'id' }); sessions.createIndex('traineeId', 'traineeId'); sessions.createIndex('unitId', 'unitId'); sessions.createIndex('startedAt', 'startedAt');
          database.createObjectStore('settings', { keyPath: 'key' });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const report = {
        total: 76, grade: 'Competent', weightedMean: 76,
        subscores: { detection: 88, classification: 74, engagement: 68, discipline: 94 },
        perContact: [], unobservable: [], penalties: [], roeCapApplied: false, reasons: [], missionDecisionPath: [],
      };
      const record = {
        id: 'phase4c-screenshot', traineeId: 'screenshot-trainee', unitId: 'screenshot-unit', startedAt: Date.now(),
        scenarioKey: 'ridge_runner', tier: 'operator', focus: 'balanced', seed: 'phase4c-screenshot',
        sessionLog: { formatVersion: 1, seed: 'phase4c-screenshot', scenarioId: 'ridge_runner', commands: [], totalTicks: 1600, generatorAvoid: [] },
        scoreVersion: '2.2', report,
        summary: { total: 76, grade: 'Competent', subscores: report.subscores, hostilesTotal: 2, hostilesNeutralised: 1, assetHit: false, durationTicks: 1600 },
        hash: 'screenshot-fixture',
      };
      const transaction = db.transaction(['trainees', 'units', 'sessions'], 'readwrite');
      transaction.objectStore('trainees').put({ id: record.traineeId, callsign: 'AAR FIXTURE', unitId: record.unitId, createdAt: Date.now() });
      transaction.objectStore('units').put({ id: record.unitId, name: 'Review Fixture', createdAt: Date.now() });
      transaction.objectStore('sessions').put(record);
      await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
      db.close();
      window.dispatchEvent(new Event('vajra:data-changed'));
    });
    await page.evaluate(() => { window.location.hash = '#/aar/session/phase4c-screenshot'; });
    await page.waitForSelector('.aar-replay-map');
    await page.evaluate(() => {
      const setRange = (selector, value) => {
        const input = document.querySelector(selector);
        if (!input) return;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setRange('input[aria-label="Replay timeline"]', 800);
      setRange('.aar-slider-label input', 100);
    });
    await delay(900);
    const screenshotPath = path.resolve('docs/screenshots/phase4c-session-review.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
