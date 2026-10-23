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
      const artifactDir = 'C:\\Users\\Shourya Upadhyay\\.gemini\\antigravity\\brain\\8764f751-615b-4181-97b2-67211edfa358';

      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 600));

      const buttons = await page.$$('.nav-mega-btn');
      console.log(`Found ${buttons.length} mega-menu buttons`);

      // 1. Scenarios dropdown (Terrain)
      if (buttons[0]) {
        await buttons[0].click();
        await new Promise((r) => setTimeout(r, 500));
        const p1 = path.join(outDir, 'navbar-mega-scenarios.png');
        await page.screenshot({ path: p1 });
        fs.copyFileSync(p1, path.join(artifactDir, 'navbar-mega-scenarios.png'));
        console.log('Captured navbar-mega-scenarios.png');
      }

      // 2. Systems dropdown (Radar)
      if (buttons[1]) {
        await buttons[1].click();
        await new Promise((r) => setTimeout(r, 500));
        const p2 = path.join(outDir, 'navbar-mega-systems.png');
        await page.screenshot({ path: p2 });
        fs.copyFileSync(p2, path.join(artifactDir, 'navbar-mega-systems.png'));
        console.log('Captured navbar-mega-systems.png');
      }

      // 3. Threats dropdown (FPV)
      if (buttons[2]) {
        await buttons[2].click();
        await new Promise((r) => setTimeout(r, 500));
        const p3 = path.join(outDir, 'navbar-mega-threats.png');
        await page.screenshot({ path: p3 });
        fs.copyFileSync(p3, path.join(artifactDir, 'navbar-mega-threats.png'));
        console.log('Captured navbar-mega-threats.png');
      }

    } finally {
      await browser.close();
    }
  } finally {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', server.pid.toString(), '/f', '/t']);
    } else {
      server.kill('SIGTERM');
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
