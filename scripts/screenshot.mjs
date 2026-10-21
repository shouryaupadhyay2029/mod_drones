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
  console.log('Starting vite preview server...');
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
    console.log('Preview server is ready.');

    const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

    console.log('Launching browser from:', chromePath);
    const browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      defaultViewport: { width: 1200, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      console.log('Navigating to http://127.0.0.1:4173 ...');
      await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle0' });

      console.log('Waiting for system check UI to mount...');
      await page.waitForSelector('#btn-verify-replay');

      // Click "Start"
      console.log('Starting simulation...');
      const buttons = await page.$$('button');
      for (const b of buttons) {
        const text = await page.evaluate((el) => el.textContent, b);
        if (text?.trim() === 'Start') {
          await b.click();
          break;
        }
      }

      // Let it run for 1 second (~20 ticks)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Click "Spawn Test Entity"
      console.log('Spawning test entity...');
      for (const b of buttons) {
        const text = await page.evaluate((el) => el.textContent, b);
        if (text?.trim() === 'Spawn Test Entity') {
          await b.click();
          break;
        }
      }

      // Run for another 500ms
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Click "Verify Replay"
      console.log('Clicking Verify Replay...');
      await page.click('#btn-verify-replay');

      // Click "Verify Snapshot"
      console.log('Clicking Verify Snapshot...');
      await page.click('#btn-verify-snapshot');

      // Wait for PASS results
      console.log('Waiting for PASS indicators...');
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const outDir = path.resolve('docs');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      const screenshotPath = path.join(outDir, 'system-check-pass.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('Screenshot saved successfully to:', screenshotPath);
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
