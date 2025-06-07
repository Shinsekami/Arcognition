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

// loose price extractor
function extractPrice(text) {
  const re = /([€$£])\s*([\d.,\s]+)/;
  const m = re.exec(text);
  if (!m) return null;
  const symbol = m[1];
  const amount = parseFloat(m[2].replace(/[,\s]/g, ''));
  return { symbol, amount };
}

/**
 * @param {Buffer} cropBuf  JPEG buffer of a single object
 * @param {string} label    e.g. "Couch"
 * @returns {Promise<Array<{site,url,thumbnail,price_eur}>>}
 */
async function googleReverseSearch(cropBuf, label) {
  // 1) reverse‐image search via Vision
  const [vd] = await visionClient.webDetection({ image: { content: cropBuf } });
  const pages = vd.webDetection.pagesWithMatchingImages || [];
  console.log(`[vision] ${label} → pages:`, pages);

  const rates = await getRates();
  const out = [];

  for (const pageUrl of pages.slice(0, 5)) {
    try {
      console.log(`[scrape] fetching ${pageUrl}`);
      const { data: html } = await axios.get(pageUrl, { timeout: 5000 });
      console.log(`[scrape] html snippet:`, html.slice(0, 200));

      const $ = cheerio.load(html);

      // thumbnail: prefer fullMatchingImages URL if provided
      const matchImg = vd.webDetection.fullMatchingImages?.[0]?.url;
      const thumb =
        $('meta[property="og:image"]').attr('content') ||
        $('img').first().attr('src') ||
        matchImg;
      console.log(`[scrape] thumbnail →`, thumb);

      // grab text to search for price
      const bodyText = $('body').text().slice(0, 1000).replace(/\s+/g, ' ');
      console.log(`[scrape] text snippet →`, bodyText.slice(0, 100));

      const pr = extractPrice(bodyText);
      if (!pr) {
        console.warn(`[scrape] no price on ${pageUrl}`);
        continue;
      }

      let { symbol, amount } = pr;
      let price_eur = amount;
      if (symbol !== '€') {
        const cur = symbol === '$' ? 'USD' : symbol === '£' ? 'GBP' : null;
        if (cur && rates[cur]) {
          price_eur = amount / rates[cur];
        }
      }

      out.push({
        site: new URL(pageUrl).hostname.replace(/^www\./, ''),
        url: pageUrl,
        thumbnail: thumb,
        price_eur: Number(price_eur.toFixed(2)),
      });

      console.log(`[scrape] success ${pageUrl} → €${price_eur.toFixed(2)}`);
    } catch (err) {
      console.error(`[scrape] error on ${pageUrl}:`, err.message);
    }
  }

  return out;
}

module.exports = { googleReverseSearch };
