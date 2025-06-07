// src/routes/index.js
const { Router } = require('express');
const sharp = require('sharp');
const {
  SuccessResponseObject,
  ErrorResponseObject,
} = require('../common/http');
const { googleReverseSearch } = require('../modules/googleReverseImageSearch');

const router = Router();

router.post('/reverse', express.json(), async (req, res) => {
  try {
    const { base64, annotations } = req.body;

    if (!base64 || !Array.isArray(annotations)) {
      return res.status(400).json(new ErrorResponseObject('Invalid payload'));
    }

    // decode & probe image size
    const imgBuf = Buffer.from(base64, 'base64');
    const meta = await sharp(imgBuf).metadata();
    const imgW = meta.width;
    const imgH = meta.height;

    console.log('[reverse] image dimensions:', imgW, 'x', imgH);
    console.log('[reverse] annotations:', annotations);

    const results = [];

    for (const ann of annotations) {
      const verts = ann.boundingPoly.normalizedVertices;
      const left = Math.round(verts[0].x * imgW);
      const top = Math.round(verts[0].y * imgH);
      const width = Math.round((verts[2].x - verts[0].x) * imgW);
      const height = Math.round((verts[2].y - verts[0].y) * imgH);

      console.log(`[reverse] cropping ${ann.name}:`, {
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
      console.log(`[reverse] ${ann.name} → ${reverse.length} matches`);

      results.push({ object: ann.name, reverse });
    }

    return res.json(new SuccessResponseObject(results));
  } catch (err) {
    console.error('[reverse] ERROR:', err);
    return res.status(500).json(new ErrorResponseObject(err.message));
  }
});

module.exports = router;
