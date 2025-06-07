// reverse_image_api/src/modules/googleReverseImageSearch.js

import axios from 'axios';

/**
 * For each annotation:
 *  1) Upload the full-image + annotation to your Supabase function,
 *  2) Grab back a public URL for the cropped image,
 *  3) Call the google-reverse-image-api with that URL,
 *  4) Return the JSON results.
 */
export default async function reverseSearchViaSupabase(base64, annotations) {
  const SUPABASE_UPLOAD =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/upload_crop';
  const GOOGLE_REVERSE_API =
    'https://google-reverse-image-api.vercel.app/reverse';

  const all = [];

  for (const ann of annotations) {
    // 1) upload & crop on Supabase
    const upload = await axios.post(
      SUPABASE_UPLOAD,
      { base64, annotation: ann },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const { publicUrl } = upload.data;
    if (!publicUrl) throw new Error('upload_crop returned no publicUrl');

    // 2) reverse-image search that URL
    const resp = await axios.post(
      GOOGLE_REVERSE_API,
      { imageUrl: publicUrl },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (!resp.data.success) {
      throw new Error('Reverse API failed: ' + resp.data.message);
    }

    // 3) collect the data you need
    all.push({
      name: ann.name,
      similarUrl: resp.data.data.similarUrl,
      resultText: resp.data.data.resultText,
    });
  }

  return all;
}
