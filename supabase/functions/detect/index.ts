import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const KEY = Deno.env.get('GOOGLE_VISION_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Content-Type': 'application/json',
};
function err(status: number, stage: string, detail: string) {
  return new Response(JSON.stringify({ ok: false, stage, detail }), {
    status,
    headers: cors,
  });
}

serve(async req => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return err(405, 'method', 'Only POST allowed');

  let body: { base64?: string };
  try {
    body = await req.json();
  } catch {
    return err(400, 'parse-json', 'Invalid JSON body');
  }
  if (!body.base64)
    return err(400, 'validate-input', '`base64` field required');
  if (!KEY) return err(500, 'env', 'GOOGLE_VISION_KEY not set');

  /* Vision call --------------------------------------------------------- */
  let vision;
  try {
    const resp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: body.base64 },
              features: [{ type: 'OBJECT_LOCALIZATION' }],
            },
          ],
        }),
      }
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return err(resp.status, 'vision-fetch', txt);
    }
    vision = await resp.json();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err(500, 'vision-network', detail);
  }

  /* extract ------------------------------------------------------------- */
  try {
    const annotations = vision.responses?.[0]?.localizedObjectAnnotations ?? [];
    return new Response(JSON.stringify({ ok: true, annotations }), {
      headers: cors,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err(500, 'extract', detail);
  }
});
