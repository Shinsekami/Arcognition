import express from 'express';
import axios from 'axios';
import sharp from 'sharp';
import vision from '@google-cloud/vision';
import reverseSearch from '../modules/googleReverseImageSearch.js';

const router = express.Router();
const client = new vision.ImageAnnotatorClient();

// POST /reverse
router.post('/', async (req, res) => {
  try {
    // 1) decode full-image
    const imgBuffer = Buffer.from(req.body.base64, 'base64');

    // 2) call Cloud Vision
    const [detection] = await client.objectLocalization({
      image: { content: imgBuffer },
    });
    const annotations = detection.localizedObjectAnnotations;

    const results = [];

    for (const ann of annotations) {
      // compute absolute crop box
      const { width: W, height: H } = await sharp(imgBuffer).metadata();
      const vs = ann.boundingPoly.normalizedVertices;
      const left = Math.round(vs[0].x * W);
      const top = Math.round(vs[0].y * H);
      const w = Math.round((vs[2].x - vs[0].x) * W);
      const h = Math.round((vs[2].y - vs[0].y) * H);

      // 3) actually crop
      const cropBuffer = await sharp(imgBuffer)
        .extract({ left, top, width: w, height: h })
        .toBuffer();

      // 4) reverse-image search the crop
      const rev = await reverseSearch(cropBuffer);
      results.push({ object: ann.name, reverse: rev });
    }

    res.json({ success: true, data: results });
  } catch (err) {
    console.error('/reverse error:', err);
    res.status(500).json({
      success: false,
      message: 'Reverse search failed',
      error: err.toString(),
    });
  }
});

export default router;
