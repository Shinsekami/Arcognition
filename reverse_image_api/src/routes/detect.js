// reverse_image_api/src/routes/detect.js
import fetch from 'node-fetch';

const KEY = process.env.GOOGLE_VISION_KEY; // ensure you set this in Cloud Run

export default async function detectObjects(base64) {
  const payload = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: 'OBJECT_LOCALIZATION' }],
      },
    ],
  };
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  const json = await res.json();
  if (res.status !== 200 || json.error) {
    throw new Error(json.error?.message || 'Vision API error');
  }
  return json.responses[0].localizedObjectAnnotations || [];
}
