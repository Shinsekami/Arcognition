import axios from 'axios';
import { ErrorResponseObject } from '../common/http.js';

export default async function downloadImageHandler(req, res) {
  try {
    const { url } = req.body;
    if (!url) {
      return res
        .status(400)
        .json(new ErrorResponseObject('Missing url in request body'));
    }
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return res.json({ success: true, base64 });
  } catch (err) {
    console.error('download_image error:', err);
    return res
      .status(500)
      .json(new ErrorResponseObject('Failed to download image'));
  }
}
