// src/modules/googleReverseImageSearch.js

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const vision = require('@google-cloud/vision');

const visionClient = new vision.ImageAnnotatorClient();

/**
 * Launch a headless browser with desktop emulation.
 */
async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 },
  });
}

/**
 * Convert Vision webDetection pages if Lens fails.
 */
async function fallbackVision(cropBuf, label) {
  console.warn(`[lens] Falling back to Vision webDetection for "${label}"`);
  const [vd] = await visionClient.webDetection({ image: { content: cropBuf } });
  return (vd.webDetection.pagesWithMatchingImages || []).slice(0, 5).map(p => ({
    site: new URL(p.url || p).hostname.replace(/^www\./, ''),
    url: p.url || p,
    thumbnail: vd.webDetection.fullMatchingImages?.[0]?.url || null,
    price_eur: null,
  }));
}

/**
 * Reverse‐image search via Google Lens UI in Puppeteer.
 */
async function googleReverseSearch(cropBuf, label) {
  console.log(`[lens] "${label}" → launching browser`);
  let browser,
    page,
    results = [];

  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    // Emulate a real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/114.0.0.0 Safari/537.36'
    );

    // 1) Go to Lens
    await page.goto('https://lens.google.com/upload', {
      waitUntil: 'networkidle2',
    });

    // 2) Upload the image
    const tmpFile = path.join(process.cwd(), 'tmp_lens.jpg');
    fs.writeFileSync(tmpFile, cropBuf);
    const input = await page.$('input[type=file]');
    if (!input) throw new Error('Lens file input not found');
    await input.uploadFile(tmpFile);

    // 3) Wait for URL change to results page
    await page.waitForFunction(() => location.pathname.startsWith('/results'), {
      timeout: 20000,
    });

    // 4) Wait for the shopping-results container to appear
    await page.waitForSelector('c-wiz[section-type="shopping_results"]', {
      timeout: 20000,
    });

    // 5) Extract up to 5 items
    const items = await page.$$eval(
      'c-wiz[section-type="shopping_results"] .sh-dgr__container',
      nodes =>
        nodes.slice(0, 5).map(n => {
          const linkEl = n.querySelector('a[href]');
          const imgEl = n.querySelector('img[src]');
          const priceEl = n.querySelector('.T14wmb, .sh-dgr__price');
          return {
            link: linkEl?.href || null,
            thumbnail: imgEl?.src || null,
            priceText: priceEl?.textContent.trim() || '',
          };
        })
    );

    // 6) Load exchange rates
    const ratesResp = await page.evaluate(async () => {
      const r = await fetch('https://api.exchangerate.host/latest?base=EUR');
      return r.json();
    });
    const rates = ratesResp.rates || {};

    // 7) Parse & convert
    results = items.map(({ link, thumbnail, priceText }) => {
      const m = priceText.match(/([₹€$£])\s*([\d,\.]+)/);
      const symbol = m?.[1] || '€';
      const raw = m?.[2] || '0';
      const amount = parseFloat(raw.replace(/,/g, '')) || 0;
      const cur =
        symbol === '$'
          ? 'USD'
          : symbol === '£'
          ? 'GBP'
          : symbol === '₹'
          ? 'INR'
          : 'EUR';
      const eur = cur === 'EUR' ? amount : amount / (rates[cur] || 1);
      return {
        site: new URL(link).hostname.replace(/^www\./, ''),
        url: link,
        thumbnail,
        price_eur: Number(eur.toFixed(2)),
      };
    });
    console.log(`[lens] "${label}" → ${results.length} items`);
  } catch (err) {
    console.warn(`[lens] error for "${label}":`, err.message);
    // fallback to Vision webDetection
    results = await fallbackVision(cropBuf, label);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
    try {
      fs.unlinkSync(path.join(process.cwd(), 'tmp_lens.jpg'));
    } catch {}
  }

  return results;
}

module.exports = { googleReverseSearch };
