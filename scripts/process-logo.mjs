import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

async function processLogo() {
  const chromePath = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const sourceImagePath = 'C:/Users/Shourya Upadhyay/.gemini/antigravity/brain/8764f751-615b-4181-97b2-67211edfa358/.user_uploaded/media_1792673200291_cc442348.jpg';
    const imageBase64 = fs.readFileSync(sourceImagePath).toString('base64');
    const dataUri = `data:image/jpeg;base64,${imageBase64}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <img id="srcImg" src="${dataUri}" />
          <canvas id="c"></canvas>
        </body>
      </html>
    `;

    await page.setContent(html);
    await page.waitForSelector('#srcImg');

    const result = await page.evaluate(async () => {
      const img = document.getElementById('srcImg');
      await img.decode();
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      // 1. Process Full Logo with transparent background
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Convert light/cream background into alpha transparency
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Luminance calculation
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (lum > 240) {
          data[i + 3] = 0; // Fully transparent
        } else if (lum > 180) {
          // Soft anti-aliased edge
          const alphaFactor = (240 - lum) / 60;
          data[i + 3] = Math.round(255 * alphaFactor);
          // Darken the RGB so fringe isn't bright
          data[i] = Math.round(r * (1 - alphaFactor * 0.5));
          data[i + 1] = Math.round(g * (1 - alphaFactor * 0.5));
          data[i + 2] = Math.round(b * (1 - alphaFactor * 0.5));
        } else {
          // Keep crisp black
          data[i] = 18;
          data[i + 1] = 17;
          data[i + 2] = 16;
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const fullLogoPng = canvas.toDataURL('image/png');

      // 2. Crop just the upper Emblem (the Vajra Sceptre + Crosshair)
      // Emblem is roughly from y=0.08 to y=0.74, x=0.25 to x=0.75
      const emblemCanvas = document.createElement('canvas');
      const ew = Math.round(w * 0.6);
      const eh = Math.round(h * 0.68);
      const ex = Math.round((w - ew) / 2);
      const ey = Math.round(h * 0.08);

      emblemCanvas.width = ew;
      emblemCanvas.height = eh;
      const eCtx = emblemCanvas.getContext('2d');
      eCtx.drawImage(canvas, ex, ey, ew, eh, 0, 0, ew, eh);
      const emblemPng = emblemCanvas.toDataURL('image/png');

      // 3. Crop just the Typography ("VAJRA" wordmark)
      // Typography is roughly from y=0.74 to y=0.90, x=0.15 to x=0.85
      const wordmarkCanvas = document.createElement('canvas');
      const ww = Math.round(w * 0.72);
      const wh = Math.round(h * 0.16);
      const wx = Math.round((w - ww) / 2);
      const wy = Math.round(h * 0.74);

      wordmarkCanvas.width = ww;
      wordmarkCanvas.height = wh;
      const wCtx = wordmarkCanvas.getContext('2d');
      wCtx.drawImage(canvas, wx, wy, ww, wh, 0, 0, ww, wh);
      const wordmarkPng = wordmarkCanvas.toDataURL('image/png');

      return {
        fullLogo: fullLogoPng,
        emblem: emblemPng,
        wordmark: wordmarkPng,
      };
    });

    // Ensure public and src/app/assets exist
    fs.mkdirSync('public', { recursive: true });
    fs.mkdirSync('src/app/assets', { recursive: true });

    // Write full logo PNG
    const fullBuffer = Buffer.from(result.fullLogo.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync('public/vajra-logo.png', fullBuffer);
    fs.writeFileSync('src/app/assets/vajra-logo.png', fullBuffer);

    // Write emblem PNG
    const emblemBuffer = Buffer.from(result.emblem.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync('public/vajra-emblem.png', emblemBuffer);
    fs.writeFileSync('src/app/assets/vajra-emblem.png', emblemBuffer);

    // Write wordmark PNG
    const wordmarkBuffer = Buffer.from(result.wordmark.replace(/^data:image\/png;base64,/, ''), 'base64');
    fs.writeFileSync('public/vajra-wordmark.png', wordmarkBuffer);
    fs.writeFileSync('src/app/assets/vajra-wordmark.png', wordmarkBuffer);

    // Copy original raw jpg as fallback
    fs.copyFileSync(sourceImagePath, 'public/vajra-raw.jpg');

    console.log('Successfully generated transparent vajra-logo.png, vajra-emblem.png, and vajra-wordmark.png');
  } finally {
    await browser.close();
  }
}

processLogo().catch(err => {
  console.error(err);
  process.exit(1);
});
