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

      // 1. Setup ridge_runner
      console.log('Selecting ridge_runner scenario...');
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent('mod:select-scenario', { detail: { scenarioId: 'ridge_runner' } })
        );
        window.dispatchEvent(new CustomEvent('mod:open-briefing'));
      });
      await new Promise((resolve) => setTimeout(resolve, 400));

      const startBtn = await page.$('#btn-start-mission');
      if (startBtn) {
        await startBtn.click();
      }

      await new Promise((resolve) => setTimeout(resolve, 600));

      // Turn on autopilot and 4x speed
      const autopilotBtn = await page.$('#btn-toggle-autopilot');
      if (autopilotBtn) await autopilotBtn.click();
      const speed4Btn = await page.$('#btn-speed-4');
      if (speed4Btn) await speed4Btn.click();

      // Wait until track appears and EO is locked
      console.log('Advancing ridge_runner at 4x until track and EO lock active...');
      await page.waitForFunction(
        () => {
          const rows = document.querySelectorAll('tbody tr');
          const eoHeader = document.querySelector('.eo-hud-target');
          return rows.length >= 1 && eoHeader && !eoHeader.textContent?.includes('IDLE');
        },
        { timeout: 15000 }
      ).catch(() => console.log('Timeout waiting for EO lock; continuing...'));

      await new Promise((resolve) => setTimeout(resolve, 1000));

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

      // Test Viewport 2: 1920x1080 (ridge_runner, day, TV, EO LOCKED)
      console.log('Testing viewport 1920x1080 (ridge_runner day TV)...');
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

      // Test Viewport 3: Night / IR scenario screenshot (city_edge_night, night, IR, EO LOCKED)
      console.log('Capturing Night / IR scenario screenshot (city_edge_night)...');
      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });
      await page.evaluate(() => {
        window.dispatchEvent(
          new CustomEvent('mod:select-scenario', { detail: { scenarioId: 'city_edge_night' } })
        );
        window.dispatchEvent(new CustomEvent('mod:open-briefing'));
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const startNightBtn = await page.$('#btn-start-mission');
      if (startNightBtn) {
        await startNightBtn.click();
      }

      await new Promise((resolve) => setTimeout(resolve, 600));

      // Autopilot + 4x speed on night mission
      const nightAutopilotBtn = await page.$('#btn-toggle-autopilot');
      if (nightAutopilotBtn) await nightAutopilotBtn.click();
      const nightSpeed4Btn = await page.$('#btn-speed-4');
      if (nightSpeed4Btn) await nightSpeed4Btn.click();

      // Wait until track appears and EO is locked in IR channel
      console.log('Advancing city_edge_night at 4x until track and EO lock active...');
      await page.waitForFunction(
        () => {
          const rows = document.querySelectorAll('tbody tr');
          const eoHeader = document.querySelector('.eo-hud-target');
          return rows.length >= 1 && eoHeader && !eoHeader.textContent?.includes('IDLE');
        },
        { timeout: 15000 }
      ).catch(() => console.log('Timeout waiting for night EO lock; continuing...'));

      await new Promise((resolve) => setTimeout(resolve, 1000));
      const pathNight = path.join(outDir, 'console-night-ir.png');
      await page.screenshot({ path: pathNight, fullPage: false });
      console.log('Saved console-night-ir.png to:', pathNight);

      console.log('PASSED: Both viewports fit with NO page scroll, and Night IR screenshot saved.');
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
