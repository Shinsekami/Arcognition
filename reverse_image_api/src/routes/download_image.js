// reverse_image_api/src/routes/download_image.js
import axios from 'axios';
import { encode as encodeBase64 } from 'base64-arraybuffer'; // or Buffer

export default async function downloadImage(url) {
  // fetch the image bytes
  const resp = await axios.get(url, { responseType: 'arraybuffer' });
  const base64 = Buffer.from(resp.data, 'binary').toString('base64');
  return base64;
}
