/* global document, window */
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
  console.log('Building app for preview...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  // Build first
  await new Promise((resolve, reject) => {
    const buildProc = spawn(npmCmd, ['run', 'build'], { shell: true, stdio: 'inherit' });
    buildProc.on('exit', (code) => {
      if (code === 0) resolve(true);
      else reject(new Error(`Build exited with code ${code}`));
    });
  });

  console.log('Starting vite preview server...');
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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      console.log('Navigating to http://127.0.0.1:4173 ...');
      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });

      // If in setup mode, click Start Mission to enter running console
      const buttons = await page.$$('button');
      for (const b of buttons) {
        const text = await page.evaluate((el) => el.textContent, b);
        if (text?.includes('START MISSION') || text?.trim() === 'Start Mission') {
          console.log('Clicking START MISSION...');
          await b.click();
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 800));

      const outDir = path.resolve('docs');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      // Test Viewport 1: 1366x768
      console.log('Testing viewport 1366x768...');
      await page.setViewport({ width: 1366, height: 768 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const scrollHeight1366 = await page.evaluate(() => document.documentElement.scrollHeight);
      const innerHeight1366 = await page.evaluate(() => window.innerHeight);
      console.log(`1366x768: scrollHeight=${scrollHeight1366}, innerHeight=${innerHeight1366}`);
      if (scrollHeight1366 > innerHeight1366) {
        throw new Error(
          `Page scroll detected at 1366x768: scrollHeight (${scrollHeight1366}) > innerHeight (${innerHeight1366})`
        );
      }

      const path1366 = path.join(outDir, 'console-1366.png');
      await page.screenshot({ path: path1366, fullPage: false });
      console.log('Saved console-1366.png to:', path1366);

      // Test Viewport 2: 1920x1080
      console.log('Testing viewport 1920x1080...');
      await page.setViewport({ width: 1920, height: 1080 });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const scrollHeight1920 = await page.evaluate(() => document.documentElement.scrollHeight);
      const innerHeight1920 = await page.evaluate(() => window.innerHeight);
      console.log(`1920x1080: scrollHeight=${scrollHeight1920}, innerHeight=${innerHeight1920}`);
      if (scrollHeight1920 > innerHeight1920) {
        throw new Error(
          `Page scroll detected at 1920x1080: scrollHeight (${scrollHeight1920}) > innerHeight (${innerHeight1920})`
        );
      }

      const path1920 = path.join(outDir, 'console-1920.png');
      await page.screenshot({ path: path1920, fullPage: false });
      console.log('Saved console-1920.png to:', path1920);

      console.log('PASSED: Both viewports fit with NO page scroll.');
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
  console.error('Error during console screenshot capture:', err);
  process.exit(1);
});
