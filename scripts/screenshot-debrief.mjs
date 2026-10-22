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

    const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      defaultViewport: { width: 1600, height: 1000 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const outDir = path.resolve('docs/screenshots');

      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });
      await page.click('#btn-start-mission');
      await page.click('#btn-toggle-autopilot');
      await page.click('#btn-speed-4');

      console.log('Waiting for mission debrief (up to 45s)...');
      await page.waitForFunction(
        () => document.body.innerText.includes('AFTER ACTION REVIEW') || document.body.innerText.includes('Mission Debrief'),
        { timeout: 50000 }
      );
      await new Promise((r) => setTimeout(r, 600));
      const debriefPath = path.join(outDir, 'debrief-screen.png');
      await page.screenshot({ path: debriefPath, fullPage: true });
      console.log('Captured debrief-screen.png at:', debriefPath);
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
  console.error('Error during debrief capture:', err);
  process.exit(1);
});
