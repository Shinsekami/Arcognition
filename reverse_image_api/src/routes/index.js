import express from 'express';
import downloadImage from './download_image.js';
import detectObjects from './detect.js';
import { ErrorResponseObject, SuccessResponseObject } from '../common/http.js';

const router = express.Router();

// Download image URL → base64
router.post('/download_image', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json(new ErrorResponseObject('`url` required'));
    }
    const base64 = await downloadImage(url);
    return res.json(new SuccessResponseObject('OK', { base64 }));
  } catch (err) {
    return res.status(500).json(new ErrorResponseObject(err.message));
  }
});

// Detect objects in base64 string
router.post('/detect', async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) {
      return res.status(400).json(new ErrorResponseObject('`base64` required'));
    }
    const annotations = await detectObjects(base64);
    return res.json(new SuccessResponseObject('OK', { annotations }));
  } catch (err) {
    return res.status(500).json(new ErrorResponseObject(err.message));
  }
});

// Reverse–image search endpoint
router.post('/reverse', async (req, res) => {
  try {
    // your existing reverse‐search logic here
    // e.g. upload to 0x0.st, fetch Google results, scrape, etc.
    const results = await /* your reverse function */ Promise.resolve([]);
    return res.json(new SuccessResponseObject('OK', { results }));
  } catch (err) {
    return res.status(500).json(new ErrorResponseObject(err.message));
  }
});

export default router;
