// src/modules/googleReverseImageSearch.js

const vision = require('@google-cloud/vision');
const axios = require('axios');
const cheerio = require('cheerio');

const visionClient = new vision.ImageAnnotatorClient();
let eurRates = null;

// fetch & cache EUR rates
async function getRates() {
  if (eurRates) return eurRates;
  const resp = await axios.get('https://api.exchangerate.host/latest?base=EUR');
  eurRates = resp.data.rates;
  console.log('[rates] loaded EUR rates');
  return eurRates;
}

// loose price extractor for arbitrary text snippets
function extractPrice(text) {
  // allow symbol before or after, commas, dots, spaces
  const re = /([€$£])\s*([\d.,\s]+)|([\d.,\s]+)\s*([€$£])/;
  const m = text.match(re);
  if (!m) return null;
  let symbol = m[1] || m[4];
  let amount = (m[2] || m[3]).replace(/[,\s]/g, '');
  amount = parseFloat(amount);
  return { symbol, amount };
}

/**
 * @param {Buffer} cropBuf  JPEG buffer of a single object
 * @param {string} label    e.g. "Couch"
 * @returns {Promise<Array<{site,url,thumbnail,price_eur}>>}
 */
async function googleReverseSearch(cropBuf, label) {
  // 1) reverse‐image via Vision Web Detection
  const [vd] = await visionClient.webDetection({ image: { content: cropBuf } });
  const pages = vd.webDetection.pagesWithMatchingImages || [];
  console.log(
    `[vision] ${label} → pages found:`,
    pages.map(p => p.url || p)
  );

  const rates = await getRates();
  const results = [];

  for (const pageInfo of pages.slice(0, 5)) {
    const pageUrl = pageInfo.url || pageInfo;
    try {
      console.log(`[scrape] fetching ${pageUrl}`);
      const { data: html } = await axios.get(pageUrl, { timeout: 5000 });
      const $ = cheerio.load(html);

      // determine hostname
      const hostname = new URL(pageUrl).hostname.replace(/^www\./, '');
      console.log(`[scrape] site: ${hostname}`);

      // 2) thumbnail selection
      const matchImg = vd.webDetection.fullMatchingImages?.[0]?.url;
      const thumb =
        matchImg ||
        $('meta[property="og:image"]').attr('content') ||
        $('img')
          .filter((i, el) => {
            const w = parseInt($(el).attr('width') || '0', 10);
            return w >= 100;
          })
          .first()
          .attr('src') ||
        $('img').first().attr('src');
      console.log(`[scrape] thumbnail → ${thumb}`);

      // 3) price extraction (site-specific)
      let priceText = null;
      if (hostname.includes('amazon.')) {
        priceText =
          $('#priceblock_ourprice').text().trim() ||
          $('#priceblock_dealprice').text().trim() ||
          $('#price_inside_buybox').text().trim() ||
          $('span.a-offscreen').first().text().trim();
      } else if (hostname.includes('ebay.')) {
        priceText =
          $('.display-price').text().trim() ||
          $('.notranslate').first().text().trim();
      } else {
        // generic: scan meta tag or body text
        priceText =
          $('meta[itemprop="price"]').attr('content') ||
          $('body')
            .text()
            .match(/([€$£]\s?[\d.,\s]+)/)?.[0] ||
          null;
      }
      console.log(`[scrape] priceText → ${priceText}`);

      const pr = priceText ? extractPrice(priceText) : null;
      if (!pr) {
        console.warn(`[scrape] no price parsed on ${hostname}`);
        continue;
      }

      // 4) convert to EUR
      let { symbol, amount } = pr;
      let price_eur = amount;
      if (symbol !== '€') {
        const cur = symbol === '$' ? 'USD' : symbol === '£' ? 'GBP' : null;
        if (cur && rates[cur]) {
          price_eur = amount / rates[cur];
        }
      }

      results.push({
        site: hostname,
        url: pageUrl,
        thumbnail: thumb,
        price_eur: Number(price_eur.toFixed(2)),
      });
      console.log(`[scrape] success ${hostname} → €${price_eur.toFixed(2)}`);
    } catch (err) {
      console.error(`[scrape] error on ${pageUrl}:`, err.message);
    }
  }

  return results;
}

module.exports = { googleReverseSearch };
