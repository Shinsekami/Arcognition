document.addEventListener('DOMContentLoaded', () => {
  // 1) Grab DOM elements
  const fileInput = document.querySelector('input[type="file"]');
  const urlInput =
    document.querySelector('#urlInput') ||
    document.querySelector('input[type="url"], input[type="text"]') ||
    document.querySelector('textarea');
  const processBtn =
    document.querySelector('#processBtn') ||
    document.querySelector('button[type="submit"]');

  if (!processBtn) {
    console.error('❌ process button not found');
    return;
  }

  // 2) API endpoints
  const SUPABASE = 'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1';
  const DOWNLOAD_IMAGE_API = `${SUPABASE}/download_image`;
  const DETECT_API = `${SUPABASE}/detect`;
  const REVERSE_SEARCH_API =
    'https://arcognition-search-490571042366.us-central1.run.app/reverse';

  // 3) Helpers
  const fetchJson = (url, opts) => fetch(url, opts).then(r => r.json());

  async function downloadToBase64(imageUrl) {
    const res = await fetchJson(DOWNLOAD_IMAGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrl }),
    });
    if (!res.ok) throw new Error(`download_image error: ${res.detail}`);
    return res.base64;
  }

  async function detect(base64) {
    const res = await fetchJson(DETECT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    if (!res.ok)
      throw new Error(`Vision API error: ${res.stage} – ${res.detail}`);
    return res.annotations;
  }

  async function reverseSearch(blob) {
    const fd = new FormData();
    fd.append('image', blob, 'crop.jpg');
    const res = await fetchJson(REVERSE_SEARCH_API, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok)
      throw new Error(`Reverse search error: ${res.detail || 'unknown'}`);
    return res;
  }

  // 4) Main click handler
  processBtn.addEventListener('click', async e => {
    e.preventDefault();
    try {
      // 4a) Acquire base64
      let base64;
      if (fileInput?.files?.length) {
        base64 = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result.split(',')[1]);
          fr.onerror = reject;
          fr.readAsDataURL(fileInput.files[0]);
        });
      } else if (urlInput?.value?.trim()) {
        console.log('⤷ URL input value:', urlInput.value.trim());
        base64 = await downloadToBase64(urlInput.value.trim());
      } else {
        alert('Provide an image file or URL');
        return;
      }

      // 4b) Run detection
      const annotations = await detect(base64);
      if (!annotations.length) {
        alert('No objects found');
        return;
      }

      // 4c) Reverse-search on full image (demo)
      const blob =
        fileInput?.files?.[0] ??
        (await fetch(`data:image/jpeg;base64,${base64}`).then(r => r.blob()));
      const matches = await reverseSearch(blob);

      console.log('✅ Annotations:', annotations);
      console.log('✅ Reverse matches:', matches);
      alert('Pipeline complete! Check the console.');
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });
});
