/* global window, indexedDB, document, HTMLInputElement */
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
    } catch { /* preview is starting */ }
    await delay(250);
  }
  if (!ready) throw new Error('Vite preview server did not start.');
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1480, height: 1040, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:4174/#/aar', { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
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
      const sessionLog = {
        formatVersion: 3, seed: 'phase5-review-seed', scenarioId: 'dawn_intrusion', totalTicks: 1600, generatorAvoid: [], commands: [],
      };
      const contact = (cause, assessedClass, answer) => ({
        actorId: 1, classId: 'bird', weight: 1, observable: true, d: .8, c: .7, e: .8, contactTotal: .77, totalScore: 77,
        assessedClass, outcome: .7, fit: .8, latency: .8,
        decisionPath: [{ id: 'classification', question: 'Was contact identified?', answer, points: 18, maxPoints: 25, cause }],
      });
      const makeReport = (total, grade, cause, assessedClass, answer, penalties) => ({
        total, grade, weightedMean: total,
        subscores: { detection: 84, classification: total, engagement: 80, discipline: penalties.length ? 75 : 100 },
        perContact: [contact(cause, assessedClass, answer)], unobservable: [], penalties, roeCapApplied: false, reasons: [], missionDecisionPath: [],
      });
      const originalReport = makeReport(68, 'Competent', 'misclassification', 'fpv_kamikaze', 'Classified as FPV', [{ reason: 'Engaged bird: -25', points: 25 }]);
      const forkReport = makeReport(93, 'Proficient', null, 'bird', 'Classified as bird', []);
      const record = (id, report, extra = {}) => ({
        id, traineeId: 'phase5-trainee', unitId: 'phase5-unit', startedAt: Date.now(), scenarioKey: 'sandbox', tier: 'scripted', focus: 'none',
        seed: sessionLog.seed, sessionLog, scoreVersion: '2.2', report,
        summary: { total: report.total, grade: report.grade, subscores: report.subscores, hostilesTotal: 1, hostilesNeutralised: report.total > 80 ? 1 : 0, assetHit: false, durationTicks: 1600 },
        hash: id, ...extra,
      });
      const original = record('phase5-parent', originalReport);
      const forkLog = { ...sessionLog, commands: [...sessionLog.commands.slice(0, 1), { tick: 600, type: 'CLASSIFY_TRACK', payload: { trackId: 1, assessedClass: 'bird' } }], forkOf: { parentId: original.id, tick: 600 } };
      const fork = record('phase5-fork', forkReport, { sessionLog: forkLog, parentId: original.id, forkTick: 600, isFork: true });
      const transaction = db.transaction(['trainees', 'units', 'sessions'], 'readwrite');
      transaction.objectStore('trainees').put({ id: 'phase5-trainee', callsign: 'PHASE 5', unitId: 'phase5-unit', createdAt: Date.now() });
      transaction.objectStore('units').put({ id: 'phase5-unit', name: 'Fork Review', createdAt: Date.now() });
      transaction.objectStore('sessions').put(original);
      transaction.objectStore('sessions').put(fork);
      await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
      db.close();
      window.dispatchEvent(new Event('vajra:data-changed'));
    });

    const outputDir = path.resolve('docs/screenshots');
    fs.mkdirSync(outputDir, { recursive: true });
    await page.goto('http://127.0.0.1:4174/#/aar/session/phase5-parent', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.aar-key-moments');
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Replay timeline"]');
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '800');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await delay(300);
    await page.screenshot({ path: path.join(outputDir, 'phase5-key-moments.png'), fullPage: true });
    console.log(`Screenshot saved: ${path.join(outputDir, 'phase5-key-moments.png')}`);

    await page.click('.aar-fork-current');
    await page.waitForSelector('.fork-practice-banner');
    await page.screenshot({ path: path.join(outputDir, 'phase5-fork-banner.png'), fullPage: true });
    console.log(`Screenshot saved: ${path.join(outputDir, 'phase5-fork-banner.png')}`);

    await page.goto('http://127.0.0.1:4174/#/aar/compare/phase5-parent/phase5-fork', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.aar-compare-narrative');
    await page.screenshot({ path: path.join(outputDir, 'phase5-compare.png'), fullPage: true });
    console.log(`Screenshot saved: ${path.join(outputDir, 'phase5-compare.png')}`);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
