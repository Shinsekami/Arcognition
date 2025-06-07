const vision = require('@google-cloud/vision');
const axios = require('axios');
const cheerio = require('cheerio');

const visionClient = new vision.ImageAnnotatorClient();
let eurRates = null;

// 1. Fetch & cache EUR exchange rates
async function getRates() {
  if (eurRates) return eurRates;
  const resp = await axios.get('https://api.exchangerate.host/latest?base=EUR');
  eurRates = resp.data.rates;
  console.log('[rates] loaded EUR rates');
  return eurRates;
}

// 2. Universal price extractor: symbols ₹ € $ £ OR 3-letter codes before/after
function extractPrice(text) {
  const re =
    /([₹€$£])\s*([\d.,\s]+)|([\d.,\s]+)\s*([₹€$£])|([\d.,\s]+)([A-Z]{3})|([A-Z]{3})([\d.,\s]+)/;
  const m = text.match(re);
  if (!m) return null;

  let symbol, raw;
  if (m[1] && m[2]) {
    // symbol before amount
    symbol = m[1];
    raw = m[2];
  } else if (m[4] && m[3]) {
    // symbol after
    symbol = m[4];
    raw = m[3];
  } else if (m[6] && m[5]) {
    // code after
    symbol = m[6];
    raw = m[5];
  } else if (m[7] && m[8]) {
    // code before
    symbol = m[7];
    raw = m[8];
  } else {
    return null;
  }

  const amount = parseFloat(raw.replace(/[,\s]/g, ''));
  if (isNaN(amount)) return null;
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

    // 2) Detect presence of enough structured data to treat it as a product page
    const hasJsonLdProduct = $('script[type="application/ld+json"]')
      .toArray()
      .some(el => {
        try {
          const o = JSON.parse($(el).html());
          return o['@type'] === 'Product';
        } catch {
          return false;
        }
      });
    const hasOgPrice = !!$('meta[property="product:price:amount"]').attr(
      'content'
    );
    const isAmazon = hostname.includes('amazon.');
    const isEbay = hostname.includes('ebay.');

    if (!hasJsonLdProduct && !hasOgPrice && !isAmazon && !isEbay) {
      console.log(`[scrape] skipping ${hostname}, not a product page`);
      continue;
    }

    // 3) Pick thumbnail (same universal logic)
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
      $('[itemprop="image"]').attr('content') ||
      $('img')
        .filter((i, el) =>
          /product|catalog|item|thumb/i.test($(el).attr('src') || '')
        )
        .first()
        .attr('src') ||
      $('img').first().attr('src');

    console.log(`[scrape] thumbnail → ${thumb}`);

    // 4) Price detection
    let priceText = null;

    // a) Amazon
    if (isAmazon) {
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
      if (priceText && !/^[₹€£$A-Z]{1,3}/.test(priceText)) {
        if (hostname.endsWith('.in')) priceText = `₹${priceText}`;
        else if (hostname.endsWith('.co.uk')) priceText = `£${priceText}`;
        else priceText = `$${priceText}`;
      }
    }

    // b) eBay
    if (!priceText && isEbay) {
      priceText =
        $('.display-price').text().trim() ||
        $('.notranslate').first().text().trim() ||
        null;
    }

    // c) JSON-LD fallback
    if (!priceText && hasJsonLdProduct) {
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

    // d) OpenGraph/Twitter
    if (!priceText && hasOgPrice) {
      const amt = $('meta[property="product:price:amount"]').attr('content');
      const cur = $('meta[property="product:price:currency"]').attr('content');
      priceText = amt && cur ? `${amt}${cur}` : null;
    }

    // e) Class-name heuristic
    if (!priceText) {
      const el = $('[class*="price"]')
        .filter((i, el) => /\d/.test($(el).text()))
        .first();
      priceText = el.text().trim() || null;
    }

    // f) Fallback regex on body text
    if (!priceText) {
      const m = $('body')
        .text()
        .match(/([₹€£$]?\s?[\d.,\s]+(?:[A-Z]{3})?)/);
      priceText = m ? m[0].trim() : null;
    }

    console.log(`[scrape] priceText → ${priceText}`);
    if (!priceText) {
      console.warn(`[scrape] skipping ${hostname}, no price detected`);
      continue;
    }

    // 5) Parse & convert
    const pr = extractPrice(priceText);
    if (!pr) {
      console.warn(`[scrape] failed to parse "${priceText}"`);
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
          : /^[A-Z]{3}$/.test(symbol)
          ? symbol
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
