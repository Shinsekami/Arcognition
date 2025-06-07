import express from 'express';
import downloadImageHandler from './download_image.js';
import detectHandler from './detect.js';
import reverseSearch from '../modules/googleReverseImageSearch.js';
import { ErrorResponseObject } from '../common/http.js';

const router = express.Router();

// parse JSON body
router.use(express.json({ limit: '10mb' }));

router.post('/download_image', downloadImageHandler);
router.post('/detect', detectHandler);

router.post('/reverse', async (req, res) => {
  try {
    const { base64, annotations } = req.body;
    if (!base64 || !Array.isArray(annotations)) {
      return res
        .status(400)
        .json(new ErrorResponseObject('Missing base64 or annotations array'));
    }
    const results = await reverseSearch(base64, annotations);
    return res.json({ success: true, data: { results } });
  } catch (err) {
    console.error('/reverse error:', err);
    return res
      .status(500)
      .json(new ErrorResponseObject('Reverse search failed'));
  }
});

export default router;
