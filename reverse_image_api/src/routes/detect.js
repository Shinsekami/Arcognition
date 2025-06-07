import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ErrorResponseObject } from '../common/http.js';
const client = new ImageAnnotatorClient();

export default async function detectHandler(req, res) {
  try {
    const { base64 } = req.body;
    if (!base64) {
      return res
        .status(400)
        .json(new ErrorResponseObject('Missing base64 in request body'));
    }
    const [result] = await client.objectLocalization({
      image: { content: base64 },
    });
    const annotations = result.localizedObjectAnnotations.map(obj => ({
      name: obj.name,
      score: obj.score,
      boundingPoly: obj.boundingPoly,
      bbox: {
        x: obj.boundingPoly.normalizedVertices[0].x,
        y: obj.boundingPoly.normalizedVertices[0].y,
        w:
          obj.boundingPoly.normalizedVertices[2].x -
          obj.boundingPoly.normalizedVertices[0].x,
        h:
          obj.boundingPoly.normalizedVertices[2].y -
          obj.boundingPoly.normalizedVertices[0].y,
      },
    }));
    return res.json({ success: true, annotations });
  } catch (err) {
    console.error('detect error:', err);
    return res
      .status(500)
      .json(new ErrorResponseObject('Vision detect failed'));
  }
}
