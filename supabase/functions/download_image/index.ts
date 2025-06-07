import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

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

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return err(400, 'parse-json', 'Invalid JSON body');
  }
  if (!body.url) return err(400, 'validate-input', '`url` field required');

  let buf: ArrayBuffer;
  try {
    const resp = await fetch(body.url);
    if (!resp.ok)
      return err(resp.status, 'image-fetch', `status ${resp.status}`);
    buf = await resp.arrayBuffer();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err(500, 'image-network', detail);
  }

  try {
    const base64 = encodeBase64(new Uint8Array(buf));
    return new Response(JSON.stringify({ ok: true, base64 }), {
      headers: cors,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err(500, 'encode', detail);
  }
});
