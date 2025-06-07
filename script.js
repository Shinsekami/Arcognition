console.log('👉 script.js loaded');

document.addEventListener('DOMContentLoaded', () => {
  const log = (...args) => console.log('[Arcognition]', ...args);

  // DOM elements
  const fileInput = document.getElementById('fileInput');
  const urlInput = document.getElementById('urlInput');
  const processBtn = document.getElementById('processBtn');
  const preview = document.getElementById('preview');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const resultsBody = document.getElementById('resultsBody');
  const downloadLink = document.getElementById('downloadLink');

  // API endpoints
  const DOWNLOAD_IMAGE_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/download_image';
  const DETECT_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/detect';
  const REVERSE_SEARCH_API =
    'https://arcognition-search-skujvj7jba-uc.a.run.app/reverse';

  // helper to fetch JSON
  const fetchJson = (url, opts) => fetch(url, opts).then(r => r.json());

  // download image URL → base64
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

  // Google Vision detect
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

  // reverse-image search
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

  processBtn.addEventListener('click', async () => {
    log('Process clicked');
    processBtn.disabled = true;
    resultsBody.innerHTML = '';
    downloadLink.classList.add('hidden');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // 1) Load image
      let base64;
      if (fileInput.files.length) {
        base64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result.split(',')[1]);
          fr.onerror = rej;
          fr.readAsDataURL(fileInput.files[0]);
        });
        preview.src = URL.createObjectURL(fileInput.files[0]);
      } else if (urlInput.value.trim()) {
        base64 = await downloadToBase64(urlInput.value.trim());
        preview.src = `data:image/jpeg;base64,${base64}`;
      } else {
        alert('Provide a file or URL');
        return;
      }

      await new Promise(r => (preview.onload = r));
      const imgW = preview.naturalWidth;
      const imgH = preview.naturalHeight;
      canvas.width = imgW;
      canvas.height = imgH;
      ctx.drawImage(preview, 0, 0);

      // 2) Detect
      const annotations = await detect(base64);
      if (!annotations.length) {
        alert('No objects detected');
        processBtn.disabled = false;
        return;
      }

      // 3) Reverse-search each annotation
      const excelRows = [];
      for (const ann of annotations) {
        // compute pixel-based bbox from normalized coords
        const verts = ann.boundingPoly.normalizedVertices;
        const x = verts[0].x * imgW;
        const y = verts[0].y * imgH;
        const w = (verts[2].x - verts[0].x) * imgW;
        const h = (verts[2].y - verts[0].y) * imgH;
        log(`BBox for ${ann.name}:`, { x, y, w, h });

        // optional: draw box on canvas
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // server‐side reverse search
        const items = await reverseSearch(base64, ann);
        log(`Items for "${ann.name}":`, items.length);

        if (!items.length) {
          resultsBody.insertAdjacentHTML(
            'beforeend',
            `<tr><td>${ann.name}</td><td colspan="2">No matches</td></tr>`
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
