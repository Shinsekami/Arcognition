console.log('👉 script.js loaded');

document.addEventListener('DOMContentLoaded', () => {
  const log = (...args) => console.log('[Arcognition]', ...args);

  // DOM elements
  const fileInput = document.querySelector('input[type="file"]');
  const urlInput = document.querySelector('#urlInput');
  const processBtn = document.querySelector('#processBtn');
  const preview = document.querySelector('#preview');
  const canvas = document.querySelector('#canvas');
  const ctx = canvas.getContext('2d');
  const resultsTable = document.querySelector('#resultsTable');
  const resultsBody = document.querySelector('#resultsBody');
  const downloadLink = document.querySelector('#downloadLink');

  if (
    !fileInput ||
    !urlInput ||
    !processBtn ||
    !preview ||
    !canvas ||
    !ctx ||
    !resultsTable ||
    !resultsBody ||
    !downloadLink
  ) {
    console.error('[Arcognition] Missing UI elements');
    return;
  }

  // Endpoints
  const SUPABASE_URL = 'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1';
  const DOWNLOAD_IMAGE_API = `${SUPABASE_URL}/download_image`;
  const DETECT_API = `${SUPABASE_URL}/detect`;
  const REVERSE_SEARCH_API =
    'https://arcognition-search-490571042366.us-central1.run.app/reverse';

  // Helper to fetch JSON
  const fetchJson = (url, opts) =>
    fetch(url, opts).then(async r => {
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON from ${url}: ${text}`);
      }
    });

  // Download URL → base64
  async function downloadToBase64(url) {
    log('Downloading image:', url);
    const res = await fetchJson(DOWNLOAD_IMAGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.base64) throw new Error('download_image failed');
    log('Downloaded base64 length:', res.base64.length);
    return res.base64;
  }

  // Call Vision detect
  async function detect(base64) {
    log('Calling detect API');
    const res = await fetchJson(DETECT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    if (!Array.isArray(res.annotations)) throw new Error('detect API failed');
    log('Annotations:', res.annotations.length);
    return res.annotations;
  }

  // Call your reverse-search service
  async function reverseSearch(base64, annotation) {
    log('Reverse search for:', annotation.name);
    const resp = await fetch(REVERSE_SEARCH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, annotations: [annotation] }),
    });
    log('Status:', resp.status);
    const json = await resp.json();
    log('Payload:', json);
    return Array.isArray(json.data?.results) ? json.data.results : [];
  }

  // Crop thumbnail client-side
  async function cropBlobFromBox(img, box) {
    const c = document.createElement('canvas');
    c.width = box.w;
    c.height = box.h;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return await new Promise(res => c.toBlob(res, 'image/jpeg'));
  }

  processBtn.addEventListener('click', async e => {
    e.preventDefault();
    log('Process clicked');
    processBtn.disabled = true;
    resultsBody.innerHTML = '';
    resultsTable.classList.add('hidden');
    downloadLink.classList.add('hidden');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // 1) Load image
      let base64, blob;
      if (fileInput.files.length) {
        blob = fileInput.files[0];
        base64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result.split(',')[1]);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        preview.src = URL.createObjectURL(blob);
      } else if (urlInput.value.trim()) {
        base64 = await downloadToBase64(urlInput.value.trim());
        blob = await fetch(`data:image/jpeg;base64,${base64}`).then(r =>
          r.blob()
        );
        preview.src = `data:image/jpeg;base64,${base64}`;
      } else {
        alert('Provide a file or URL');
        return;
      }

      await new Promise(r => (preview.onload = r));
      canvas.width = preview.naturalWidth;
      canvas.height = preview.naturalHeight;
      ctx.drawImage(preview, 0, 0);

      // 2) Detect
      const annotations = await detect(base64);
      if (!annotations.length) {
        alert('No objects detected');
        return;
      }

      // 3) Reverse-search & render
      const excelRows = [];
      resultsTable.classList.remove('hidden');

      for (const ann of annotations) {
        log('Processing:', ann.name);
        // Show thumbnail locally
        const thumbBlob = await cropBlobFromBox(preview, ann.bbox);
        // Perform server-side reverse search
        const items = await reverseSearch(base64, ann);
        log('Found items:', items.length);

        if (!items.length) {
          resultsBody.insertAdjacentHTML(
            'beforeend',
            `<tr><td>${ann.name}</td><td colspan="2">No matches found</td></tr>`
          );
          excelRows.push({ Item: ann.name, Site: '', Price: '', Link: '' });
        } else {
          items.slice(0, 5).forEach(it => {
            resultsBody.insertAdjacentHTML(
              'beforeend',
              `<tr>
                 <td>${ann.name}</td>
                 <td><a href="${it.url}" target="_blank">${it.site}</a></td>
                 <td>€${it.price_eur}</td>
               </tr>`
            );
            excelRows.push({
              Item: ann.name,
              Site: it.site,
              Price: it.price_eur,
              Link: it.url,
            });
          });
        }
      }

      // 4) Export Excel
      log('Generating Excel rows:', excelRows.length);
      if (excelRows.length) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([out], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = 'arcognition_report.xlsx';
        downloadLink.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      processBtn.disabled = false;
    }
  });
});
