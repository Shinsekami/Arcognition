import express from 'express';
import sharp from 'sharp';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import reverseSearch from '../modules/googleReverseImageSearch.js';

const router = express.Router();
const visionClient = new ImageAnnotatorClient();

// POST /reverse
// Expects JSON { base64: "<your-image-in-base64>" }
router.post('/', async (req, res) => {
  const { base64 } = req.body;

  // 1) validate input
  if (!base64) {
    return res.status(400).json({
      success: false,
      message: 'Missing "base64" image data in request body',
    });
  }

  let imgBuffer;
  try {
    imgBuffer = Buffer.from(base64, 'base64');
  } catch (e) {
    return res
      .status(400)
      .json({ success: false, message: 'Invalid base64 image data' });
  }

  try {
    // 2) detect objects with Cloud Vision
    const [visionResponse] = await visionClient.objectLocalization({
      image: { content: imgBuffer },
    });

    const annotations = visionResponse.localizedObjectAnnotations || [];
    if (annotations.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const results = [];

    for (const ann of annotations) {
      // 3) compute absolute crop rectangle
      const { width: imgW, height: imgH } = await sharp(imgBuffer).metadata();
      const vs = ann.boundingPoly.normalizedVertices;
      const left = Math.round(vs[0].x * imgW);
      const top = Math.round(vs[0].y * imgH);
      const width = Math.round((vs[2].x - vs[0].x) * imgW);
      const height = Math.round((vs[2].y - vs[0].y) * imgH);

      // 4) crop out the object
      const cropBuffer = await sharp(imgBuffer)
        .extract({ left, top, width, height })
        .toBuffer();

      // 5) do your reverse‐image search
      let reverseResults;
      try {
        reverseResults = await reverseSearch(cropBuffer);
      } catch (err) {
        console.error('reverseSearch failed for', ann.name, err);
        // you can choose to push an error or just empty array
        reverseResults = { error: err.message };
      }

      results.push({
        object: ann.name,
        reverse: reverseResults,
      });
    }

    // 6) send back everything
    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('/reverse error:', err);
    return res.status(500).json({
      success: false,
      message: 'Reverse search failed',
      error: err.message,
    });
  }
});

export default router;
