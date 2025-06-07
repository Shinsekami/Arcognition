import sharp from 'sharp';
import axios from 'axios';
import { load } from 'cheerio';

/**
 * Given a Base64‐encoded image and Vision annotations,
 * crops each detected object and reverse‐searches it,
 * scraping the top 5 matches for site, URL, price_eur, and thumbnail.
 *
 * @param {string} base64      Base64 image string
 * @param {Array}  annotations [{ name, boundingPoly: { normalizedVertices: [...] } }, …]
 * @returns {Promise<Array<{ site, url, price_eur, thumbnail }>>}
 */
export default async function googleReverseImageSearch(base64, annotations) {
  // Decode Base64 to buffer
  const imgBuffer = Buffer.from(base64, 'base64');
  const { width: imgW, height: imgH } = await sharp(imgBuffer).metadata();

  const allResults = [];

  for (const ann of annotations) {
    const verts = ann.boundingPoly.normalizedVertices;
    const left = Math.round(verts[0].x * imgW);
    const top = Math.round(verts[0].y * imgH);
    const width = Math.round((verts[2].x - verts[0].x) * imgW);
    const height = Math.round((verts[2].y - verts[0].y) * imgH);

    // Crop the object
    const cropBuffer = await sharp(imgBuffer)
      .extract({ left, top, width, height })
      .toBuffer();

    // Reverse‐image search via your scraper endpoint
    const response = await axios.post(
      'https://your-reverse-endpoint.example.com/search',
      cropBuffer,
      { headers: { 'Content-Type': 'application/octet-stream' } }
    );

    // Parse HTML with Cheerio
    const $ = load(response.data);
    $('.product-item')
      .slice(0, 5)
      .each((_, el) => {
        const site = $(el).find('.seller-name').text().trim();
        const url = $(el).find('a.product-link').attr('href');
        const priceText = $(el).find('.price').text().trim();
        const price_eur = parseFloat(
          priceText
            .replace(/[^\d.,]/g, '')
            .replace(/\./g, '')
            .replace(',', '.')
        );
        const thumbnail = $(el).find('img.product-thumb').attr('src');
        allResults.push({ site, url, price_eur, thumbnail });
      });
  }

  return allResults;
}
