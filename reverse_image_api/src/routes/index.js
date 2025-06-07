// src/routes/index.js
const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const { googleReverseSearch } = require('../modules/googleReverseImageSearch');

// POST /reverse
router.post('/', async (req, res) => {
  try {
    const { base64, annotations } = req.body;
    if (typeof base64 !== 'string' || !Array.isArray(annotations)) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    // decode image
    const imgBuf = Buffer.from(base64, 'base64');

    // try to read dimensions, but catch the MetadataLookupWarning
    let imgW, imgH;
    try {
      const meta = await sharp(imgBuf).metadata();
      imgW = meta.width;
      imgH = meta.height;
    } catch (err) {
      console.warn('[reverse] sharp.metadata() failed:', err.message);
      // fallback to 1x1 so your normalizedVertices still yield non-zero crops
      imgW = imgH = 1;
    }
    console.log('[reverse] image size:', imgW, 'x', imgH);

    const results = [];
    for (const ann of annotations) {
      const v = ann.boundingPoly.normalizedVertices;
      const left = Math.round(v[0].x * imgW);
      const top = Math.round(v[0].y * imgH);
      const width = Math.round((v[2].x - v[0].x) * imgW);
      const height = Math.round((v[2].y - v[0].y) * imgH);

      console.log(`[reverse] cropping "${ann.name}":`, {
        left,
        top,
        width,
        height,
      });
      const cropBuf = await sharp(imgBuf)
        .extract({ left, top, width, height })
        .jpeg()
        .toBuffer();

      const reverse = await googleReverseSearch(cropBuf, ann.name);
      console.log(`[reverse] "${ann.name}" → ${reverse.length} matches`);
      results.push({ object: ann.name, reverse });
    }

    return res.json({ success: true, data: results });
  } catch (err) {
    console.error('[reverse] ERROR:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
