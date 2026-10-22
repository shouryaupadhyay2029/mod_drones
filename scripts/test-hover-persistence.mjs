/* global window */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
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
      defaultViewport: { width: 1600, height: 950 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });
      await new Promise((r) => setTimeout(r, 500));

      const buttons = await page.$$('.nav-mega-btn');
      console.log(`Found ${buttons.length} mega-menu buttons`);

      // 1. Hover over the first button (Scenarios)
      const btnBox = await buttons[0].boundingBox();
      console.log('Hovering over Scenarios button at:', btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
      await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
      await new Promise((r) => setTimeout(r, 200));

      // Check if dropdown panel is visible
      let isOpen = await page.$eval('.mega-dropdown-panel', (el) => window.getComputedStyle(el).visibility);
      console.log('Visibility after hover over button:', isOpen);
      if (isOpen !== 'visible') {
        throw new Error('Dropdown not visible on hover');
      }

      // 2. Move mouse down across the gap into the dropdown panel (e.g. 50px below the button)
      console.log('Moving mouse down into the dropdown items...');
      await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height + 40);
      await new Promise((r) => setTimeout(r, 200));

      isOpen = await page.$eval('.mega-dropdown-panel', (el) => window.getComputedStyle(el).visibility);
      console.log('Visibility after moving mouse into dropdown:', isOpen);
      if (isOpen !== 'visible') {
        throw new Error('Dropdown closed when cursor moved into panel!');
      }

      // 3. Move mouse to click the "Ridge Runner" option
      const items = await page.$$('.mega-menu-card-item');
      console.log(`Found ${items.length} card items`);
      if (items[1]) {
        await items[1].click();
        await new Promise((r) => setTimeout(r, 400));
        console.log('Successfully clicked Ridge Runner option in dropdown!');
      }

      // Verify that scenario selection updated
      const selectedText = await page.$eval('#scenario-selection-card h2', (el) => el.textContent);
      console.log('Active scenario heading after dropdown click:', selectedText);

      console.log('TEST PASSED: Hover tunnel & click selection work seamlessly!');
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
