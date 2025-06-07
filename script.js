console.log('👉 script.js loaded');

document.addEventListener('DOMContentLoaded', () => {
  const log = (...args) => console.log('[Arcognition]', ...args);

  // Robust selectors: no reliance on IDs that may not exist
  const fileInput = document.querySelector('input[type="file"]');
  const urlInput = document.querySelector(
    'input[type="text"], input[name="url"]'
  );
  const processBtn = document.querySelector(
    'button#processBtn, button[type="submit"], button'
  );
  const preview = document.querySelector('img#preview, img.preview');
  const canvas = document.querySelector('canvas#canvas, canvas');
  const ctx = canvas && canvas.getContext('2d');
  const resultsBody = document.querySelector('tbody#resultsBody, tbody');
  const downloadLink = document.querySelector('a#downloadLink, a.download');

  if (
    !fileInput ||
    !urlInput ||
    !processBtn ||
    !preview ||
    !canvas ||
    !ctx ||
    !resultsBody ||
    !downloadLink
  ) {
    console.error('[Arcognition] Missing required UI elements');
    return;
  }

  // API endpoints
  const DOWNLOAD_IMAGE_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/download_image';
  const DETECT_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/detect';
  const REVERSE_SEARCH_API =
    'https://arcognition-search-490571042366.us-central1.run.app/reverse';

  // helper to fetch JSON
  const fetchJson = (url, opts) =>
    fetch(url, opts).then(async r => {
      const text = await r.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON from ${url}: ${text}`);
      }
    });

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

  async function getBase64FromFile(file) {
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  processBtn.addEventListener('click', async e => {
    e.preventDefault();
    log('Process clicked');
    processBtn.disabled = true;
    resultsBody.innerHTML = '';
    downloadLink.classList.add('hidden');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // 1. Load image
      let base64;
      if (fileInput.files && fileInput.files.length > 0) {
        base64 = await getBase64FromFile(fileInput.files[0]);
        preview.src = URL.createObjectURL(fileInput.files[0]);
      } else if (urlInput.value && urlInput.value.trim()) {
        base64 = await downloadToBase64(urlInput.value.trim());
        preview.src = `data:image/jpeg;base64,${base64}`;
      } else {
        alert('Please select a file or enter an image URL.');
        processBtn.disabled = false;
        return;
      }

      await new Promise(r => (preview.onload = r));
      const imgW = preview.naturalWidth,
        imgH = preview.naturalHeight;
      canvas.width = imgW;
      canvas.height = imgH;
      ctx.drawImage(preview, 0, 0);

      // 2. Detect
      const annotations = await detect(base64);
      if (!annotations.length) {
        alert('No objects detected in the image.');
        processBtn.disabled = false;
        return;
      }

      // 3. Reverse‐image search & render
      const excelRows = [];
      for (const ann of annotations) {
        // draw bounding box
        const verts = ann.boundingPoly.normalizedVertices;
        const x = verts[0].x * imgW,
          y = verts[0].y * imgH;
        const w = (verts[2].x - verts[0].x) * imgW,
          h = (verts[2].y - verts[0].y) * imgH;
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // search
        const items = await reverseSearch(base64, ann);
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

      // 4. Excel export
      if (excelRows.length) {
        log('Generating Excel rows:', excelRows.length);
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
