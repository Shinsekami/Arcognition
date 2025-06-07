// src/modules/googleReverseImageSearch.js

const vision = require('@google-cloud/vision');
const axios = require('axios');
const cheerio = require('cheerio');

const visionClient = new vision.ImageAnnotatorClient();
let eurRates = null;

// Fetch & cache EUR exchange rates
async function getRates() {
  if (eurRates) return eurRates;
  const resp = await axios.get('https://api.exchangerate.host/latest?base=EUR');
  eurRates = resp.data.rates;
  console.log('[rates] loaded EUR rates');
  return eurRates;
}

// Universal price extractor: symbols ₹ € $ £ before or after, or bare numbers
function extractPrice(text) {
  const re = /([₹€$£])\s*([\d.,\s]+)|([\d.,\s]+)\s*([₹€$£])|^([\d.,\s]+)$/;
  const m = text.match(re);
  if (!m) return null;
  // m[1]=symbol before, m[2]=amount after symbol, m[3]=amount before symbol, m[4]=symbol after, m[5]=bare number
  let symbol = m[1] || m[4] || null;
  let raw = m[2] || m[3] || m[5] || '';
  const clean = raw.replace(/[,\s]/g, '');
  const amount = parseFloat(clean);
  if (!amount) return null;
  return { symbol, amount };
}

/**
 * Reverse‐image search + scraping for furniture item.
 * @param {Buffer} cropBuf  JPEG/PNG buffer of the cropped object
 * @param {string} label    Detected object name (e.g. "Couch")
 * @returns {Promise<Array<{site,url,thumbnail,price_eur}>>}
 */
async function googleReverseSearch(cropBuf, label) {
  // 1) Vision Web Detection
  const [vd] = await visionClient.webDetection({ image: { content: cropBuf } });
  const pages = vd.webDetection.pagesWithMatchingImages || [];
  console.log(`[vision] ${label} → found ${pages.length} pages`);

  const rates = await getRates();
  const results = [];

  for (const pi of pages.slice(0, 5)) {
    const pageUrl = pi.url || pi;
    console.log(`[scrape] fetching ${pageUrl}`);
    let html;
    try {
      html = (await axios.get(pageUrl, { timeout: 8000 })).data;
    } catch (err) {
      console.error(`[scrape] error fetching ${pageUrl}:`, err.message);
      continue;
    }

    const $ = cheerio.load(html);
    const hostname = new URL(pageUrl).hostname.replace(/^www\./, '');
    console.log(`[scrape] site: ${hostname}`);

    // ——— UNIVERSAL THUMBNAIL PICKER ——————————————————————
    const ldImages = $('script[type="application/ld+json"]')
      .map((i, el) => {
        try {
          const o = JSON.parse($(el).html());
          if (o['@type'] === 'Product' && o.image) {
            return Array.isArray(o.image) ? o.image[0] : o.image;
          }
        } catch {}
        return null;
      })
      .get()
      .find(Boolean);

    const thumb =
      vd.webDetection.fullMatchingImages?.[0]?.url ||
      ldImages ||
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('[itemprop="image"]').attr('content') ||
      $('[itemprop="image"]').attr('src') ||
      $('img')
        .filter((i, el) =>
          /product|catalog|item|thumb/i.test($(el).attr('src') || '')
        )
        .first()
        .attr('src') ||
      $('img').first().attr('src');

    console.log(`[scrape] thumbnail → ${thumb}`);

    // ——— UNIVERSAL PRICE PICKER ——————————————————————
    let priceText = null;

    // 1) Amazon-specific (IN, UK, US, etc.)
    if (hostname.includes('amazon.')) {
      priceText =
        $('#priceblock_ourprice').text().trim() ||
        $('#priceblock_dealprice').text().trim() ||
        (() => {
          const w = $('span.a-price-whole').first().text().trim();
          const f = $('span.a-price-fraction').first().text().trim();
          return w ? `${w}${f || ''}` : null;
        })() ||
        $('span.a-offscreen').first().text().trim() ||
        null;

      // Reattach symbol if missing
      if (priceText && !/^[₹€$£]/.test(priceText)) {
        if (hostname.endsWith('.in')) priceText = `₹${priceText}`;
        else if (hostname.endsWith('.co.uk')) priceText = `£${priceText}`;
        else if (hostname.includes('.com')) priceText = `$${priceText}`;
      }
    }

    // 2) JSON-LD schema.org/Product
    if (!priceText) {
      $('script[type="application/ld+json"]').each((i, el) => {
        if (priceText) return;
        try {
          const o = JSON.parse($(el).html());
          if (o['@type'] === 'Product' && o.offers) {
            priceText = `${o.offers.price}${o.offers.priceCurrency || ''}`;
          }
        } catch {}
      });
    }

    // 3) OpenGraph / Twitter
    if (!priceText) {
      const ogAmt = $('meta[property="product:price:amount"]').attr('content');
      const ogCur = $('meta[property="product:price:currency"]').attr(
        'content'
      );
      if (ogAmt && ogCur) priceText = `${ogAmt}${ogCur}`;
      if (!priceText) {
        priceText =
          $(
            'meta[name="twitter:data1"][value*="₹"],meta[name="twitter:data1"][value*="£"],meta[name="twitter:data1"][value*="$"]'
          ).attr('value') || null;
      }
    }

    // 4) Microdata itemprop
    if (!priceText) {
      priceText =
        $('[itemprop="price"]').attr('content') ||
        $('[itemprop="price"]').text().trim() ||
        null;
    }

    // 5) Class-name heuristic
    if (!priceText) {
      const el = $('[class*="price"]')
        .filter((i, el) => /\d/.test($(el).text()))
        .first();
      priceText = el.text().trim() || null;
    }

    // 6) Fallback regex on body text
    if (!priceText) {
      const m = $('body')
        .text()
        .match(/([₹€£$]?\s?[\d.,\s]+)/);
      priceText = m ? m[0].trim() : null;
    }

    console.log(`[scrape] priceText → ${priceText}`);
    if (!priceText) {
      console.warn(`[scrape] skipping ${hostname}, no price detected`);
      continue;
    }

    // ——— PARSE & CONVERT —————————————————————————————————
    const pr = extractPrice(priceText);
    if (!pr) {
      console.warn(`[scrape] failed to parse price "${priceText}"`);
      continue;
    }

    let { symbol, amount } = pr;
    let price_eur = amount;
    if (symbol !== '€' && rates) {
      const cur =
        symbol === '$'
          ? 'USD'
          : symbol === '£'
          ? 'GBP'
          : symbol === '₹'
          ? 'INR'
          : null;
      if (cur && rates[cur]) price_eur = amount / rates[cur];
    }

    results.push({
      site: hostname,
      url: pageUrl,
      thumbnail: thumb,
      price_eur: Number(price_eur.toFixed(2)),
    });
    console.log(`[scrape] success ${hostname} → €${price_eur.toFixed(2)}`);
  }

  return results;
}

module.exports = { googleReverseSearch };
