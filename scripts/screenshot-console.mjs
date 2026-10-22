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

  // Ensure screenshots directory exists
  const outDir = path.resolve('docs', 'screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

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
      defaultViewport: { width: 1440, height: 960 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      console.log('Navigating to http://127.0.0.1:4173/#/ ...');
      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });

      // Wait for Mission Setup form
      console.log('Setting seed to s1...');
      await page.waitForSelector('#missionSeed');
      await page.$eval('#missionSeed', (el) => {
        el.value = 's1';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // Click Start Mission
      console.log('Starting mission...');
      await page.click('#btn-start-mission');

      // Enable Autopilot and 2x speed for stable capture
      console.log('Waiting for TopBar controls...');
      await page.waitForSelector('#btn-toggle-autopilot');

      console.log('Enabling Autopilot & 2x speed...');
      await page.click('#btn-toggle-autopilot');
      await page.click('#btn-speed-2');

      // Wait until at least 2 tracks are visible on radar
      console.log('Waiting for at least 2 tracks to be visible on radar...');
      let fullCaptured = false;
      const startTime = Date.now();

      while (Date.now() - startTime < 45000) {
        const trackRows = await page.$$('tbody tr');
        if (trackRows.length >= 2) {
          const firstRowText = await page.evaluate((el) => el.textContent, trackRows[0]);
          if (!firstRowText?.includes('No active tracks')) {
            // Select the first track
            console.log(`Detected ${trackRows.length} active tracks. Selecting first track...`);
            await trackRows[0].click();
            await new Promise((r) => setTimeout(r, 250));

            // Extract mission telemetry & visible tracks
            const captureDetails = await page.evaluate(() => {
              const tickText = document.getElementById('missionTick')?.textContent?.trim() || '';
              const timeText = document.getElementById('missionTime')?.textContent?.trim() || '';
              const rows = Array.from(document.querySelectorAll('tbody tr'));
              const tracks = rows.map((row) => {
                const cells = Array.from(row.querySelectorAll('td')).map((c) => c.textContent?.trim());
                return {
                  id: cells[0] || '',
                  state: cells[1] || '',
                  range: cells[2] || '',
                  bearing: cells[3] || '',
                  course: cells[4] || '',
                  speed: cells[6] || '',
                };
              });
              return { tickText, timeText, tracks };
            });

            console.log('\n=== CONSOLE FULL SCREENSHOT CAPTURE DETAILS ===');
            console.log(`Mission tick at capture: ${captureDetails.tickText} (${captureDetails.timeText})`);
            console.log('Visible tracks:');
            for (const trk of captureDetails.tracks) {
              console.log(`  - Track ${trk.id} (${trk.state}): range = ${trk.range}, bearing = ${trk.bearing}, speed = ${trk.speed}`);
            }
            console.log('===============================================\n');

            const fullPath = path.join(outDir, 'console-full.png');
            await page.screenshot({ path: fullPath, fullPage: true });
            console.log('Saved console-full.png to:', fullPath);
            fullCaptured = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!fullCaptured) {
        console.warn('Timed out waiting for 2 tracks; capturing current state as console-full.png');
        const fullPath = path.join(outDir, 'console-full.png');
        await page.screenshot({ path: fullPath, fullPage: true });
      }

      // Switch to 4x speed to finish mission quickly
      await page.click('#btn-speed-4');

      // Wait for debrief screen to appear (button #btn-replay-same-seed)
      console.log('Waiting for mission to finish and debrief screen to render...');
      await page.waitForSelector('#btn-replay-same-seed', { timeout: 90000 });

      console.log('Mission finished! Capturing console-debrief.png...');
      const debriefPath = path.join(outDir, 'console-debrief.png');
      await page.screenshot({ path: debriefPath, fullPage: true });
      console.log('Saved console-debrief.png to:', debriefPath);

      console.log('Smoke test completed successfully!');
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
