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
  const rootDir = path.resolve('C:\\Users\\Shourya Upadhyay\\OneDrive\\Documents\\ALL CODES\\MoD\\mod_drones');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const server = spawn(
    npxCmd,
    ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    {
      cwd: rootDir,
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
      defaultViewport: { width: 1600, height: 950 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const outDir = path.resolve('docs/screenshots');

      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'domcontentloaded' });
      // Capture early scattered ASCII phase (~350ms)
      await new Promise((r) => setTimeout(r, 350));
      const scatteredPath = path.join(outDir, 'hero-scattered-drone.png');
      await page.screenshot({ path: scatteredPath });
      const artifactDir = 'C:\\Users\\Shourya Upadhyay\\.gemini\\antigravity\\brain\\8764f751-615b-4181-97b2-67211edfa358';
      fs.copyFileSync(scatteredPath, path.join(artifactDir, 'hero-scattered-drone.png'));
      console.log('Captured hero-scattered-drone.png at:', scatteredPath);

      // Wait for complete reassembly and rotation settle (2200ms further)
      await new Promise((r) => setTimeout(r, 2200));

      const heroPath = path.join(outDir, 'hero-ascii-drone.png');
      await page.screenshot({ path: heroPath });
      fs.copyFileSync(heroPath, path.join(artifactDir, 'hero-seamless-drone.png'));
      console.log('Captured clean home hero at:', heroPath);

      // Click the navbar "LAUNCH MISSION ⚡" button to open the briefing modal
      await page.click('#btn-nav-launch-mission');
      await new Promise((r) => setTimeout(r, 500));

      const modalPath = path.join(outDir, 'briefing-modal.png');
      await page.screenshot({ path: modalPath });
      fs.copyFileSync(modalPath, path.join(artifactDir, 'briefing-modal.png'));
      console.log('Captured briefing modal at:', modalPath);
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
  console.error('Error during hero capture:', err);
  process.exit(1);
});
