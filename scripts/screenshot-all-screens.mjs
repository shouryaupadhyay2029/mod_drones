/* global document */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

function waitForServer(url, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve(true);
          } else {
            setTimeout(check, 200);
          }
        })
        .on('error', () => {
          if (Date.now() - start > timeout) {
            reject(new Error('Timed out waiting for preview server'));
          } else {
            setTimeout(check, 200);
          }
        });
    }
    check();
  });
}

async function run() {
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const server = spawn(
    npxCmd,
    ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    {
      shell: true,
      stdio: 'inherit',
    }
  );

  try {
    await waitForServer('http://127.0.0.1:4173');
    console.log('Preview server ready.');

    const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      defaultViewport: { width: 1600, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const outDir = path.resolve('docs/screenshots');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      // 1. Mission Setup Screen
      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(outDir, 'setup-screen.png') });
      console.log('Captured setup-screen.png');

      // 2. Start Mission & Turn on Autopilot for lively mid-mission state
      await page.click('#btn-start-mission');
      await new Promise((r) => setTimeout(r, 600));

      // Turn on autopilot and 4x speed to advance to mid-mission
      await page.click('#btn-toggle-autopilot');
      await page.click('#btn-speed-4');
      
      try {
        await page.waitForFunction(
          () => document.querySelectorAll('tbody tr').length > 0 && !document.body.innerText.includes('No active tracks'),
          { timeout: 8000 }
        );
      } catch {
        console.log('Track wait timed out, continuing');
      }

      // Select track
      const firstRow = await page.$('tbody tr');
      if (firstRow) {
        await firstRow.click();
      }

      // Pause to capture crisp mid-mission snapshot
      await page.click('#btn-toggle-pause');
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(outDir, 'running-screen.png') });
      console.log('Captured running-screen.png');

      // Resume at 4x until debrief
      await page.click('#btn-toggle-pause');
      console.log('Waiting for debrief screen...');
      try {
        await page.waitForFunction(
          () => document.body.innerText.includes('AFTER ACTION REVIEW') || document.body.innerText.includes('Mission Debrief'),
          { timeout: 15000 }
        );
        await new Promise((r) => setTimeout(r, 800));
        await page.screenshot({ path: path.join(outDir, 'debrief-screen.png') });
        console.log('Captured debrief-screen.png');
      } catch {
        console.log('Debrief screen timeout, continuing to system check');
      }

      // 4. System Check page
      await page.goto('http://127.0.0.1:4173/#/check', { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(outDir, 'system-check-screen.png') });
      console.log('Captured system-check-screen.png');

      console.log('All screenshots captured successfully!');
    } finally {
      await browser.close();
    }
  } finally {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(server.pid), '/f', '/t']);
    } else {
      server.kill();
    }
  }
}

run().catch((err) => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
