import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js';
import sharp from 'npm:sharp';

// Initialize Supabase client from env
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

serve(async req => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { base64, annotation } = await req.json();
    if (!base64 || !annotation || !annotation.boundingPoly) {
      return new Response(
        JSON.stringify({ error: 'Missing base64 or annotation.boundingPoly' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Decode & crop
    const imgBuffer = Buffer.from(base64, 'base64');
    const meta = await sharp(imgBuffer).metadata();
    const V = annotation.boundingPoly.normalizedVertices;
    const left = Math.round(V[0].x * meta.width);
    const top = Math.round(V[0].y * meta.height);
    const width = Math.round((V[2].x - V[0].x) * meta.width);
    const height = Math.round((V[2].y - V[0].y) * meta.height);

    const cropBuffer = await sharp(imgBuffer)
      .extract({ left, top, width, height })
      .jpeg()
      .toBuffer();

    // Upload to bucket
    const key = `crops/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('reverse-crops')
      .upload(key, cropBuffer, {
        contentType: 'image/jpeg',
      });
    if (uploadError) throw uploadError;

    // Public URL
    const { publicUrl } = supabase.storage
      .from('reverse-crops')
      .getPublicUrl(key).data;

    return new Response(JSON.stringify({ publicUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('upload_crop error:', err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
