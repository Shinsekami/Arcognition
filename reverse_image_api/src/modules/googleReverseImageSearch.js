import { ImageAnnotatorClient } from '@google-cloud/vision';
import axios from 'axios';
import { load } from 'cheerio';

const visionClient = new ImageAnnotatorClient();

// one-time fetch of EUR rates
let eurRates = null;
async function getRates() {
  if (eurRates) return eurRates;
  const { data } = await axios.get(
    'https://api.exchangerate.host/latest?base=EUR'
  );
  eurRates = data.rates;
  return eurRates;
}

// parse “$1,299.99” or “2999 CZK” into { code, amount }
function extractPrice(str) {
  const reSym = /([$£¥€])\s?([\d,]+(?:\.\d+)?)/;
  const reCode = /([\d,]+(?:\.\d+)?)\s?(EUR|USD|GBP|CAD|AUD|JPY|CZK)/i;
  let m = reSym.exec(str);
  if (m)
    return {
      code: { $: 'USD', '£': 'GBP', '¥': 'JPY', '€': 'EUR' }[m[1]],
      amount: parseFloat(m[2].replace(/,/g, '')),
    };
  m = reCode.exec(str);
  if (m)
    return {
      code: m[2].toUpperCase(),
      amount: parseFloat(m[1].replace(/,/g, '')),
    };
  return null;
}

export default async function reverseSearch(buffer) {
  // 1) webDetection via Vision
  const [vd] = await visionClient.webDetection({ image: { content: buffer } });
  const pages = (vd.webDetection?.pagesWithMatchingImages || []).slice(0, 5);
  if (!pages.length) return [];

  // 2) load FX rates
  const rates = await getRates();

  // 3) scrape each page (max 3 at a time)
  const out = [];
  for (let i = 0; i < pages.length; i += 3) {
    const batch = pages.slice(i, i + 3).map(async p => {
      try {
        const url = p.url;
        const resp = await axios.get(url, { timeout: 5000 });
        const $ = load(resp.data, { decodeEntities: true });

        // pick a thumbnail: fullMatchingImages has absolute URL
        let thumb = p.fullMatchingImages?.[0]?.url;
        if (!thumb) {
          // fallback to first <img>
          let src = $('img').first().attr('src') || '';
          // resolve relative URLs
          thumb = new URL(src, url).href;
        }

        // find the first price in text nodes
        let found = null;
        $('body *').each((_, el) => {
          const txt = $(el).text().trim();
          const pr = extractPrice(txt);
          if (pr) {
            found = pr;
            return false; // break .each
          }
        });
        if (!found) throw new Error('no price');

        // convert to EUR
        let eur = found.amount;
        if (found.code !== 'EUR') eur = eur / (rates[found.code] || 1);

        return {
          site: new URL(url).hostname,
          url,
          thumbnail: thumb,
          price_eur: +eur.toFixed(2),
        };
      } catch (err) {
        // swallow per-page failures
        return null;
      }
    });

    const results = await Promise.all(batch);
    out.push(...results.filter(Boolean));
  }

  return out;
}
