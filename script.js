console.log('👉 script.js loaded');

document.addEventListener('DOMContentLoaded', () => {
  const log = (...args) => console.log('[Arcognition]', ...args);

  // UI elements
  const fileInput = document.querySelector('input[type="file"]');
  const urlInput = document.querySelector(
    'input[type="text"], input[name="url"]'
  );
  const processBtn = document.querySelector(
    'button#processBtn, button[type="submit"], button'
  );
  const preview = document.querySelector('img#preview, img.preview');
  const canvas = document.querySelector('canvas#canvas, canvas');
  const ctx = canvas.getContext('2d');
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

  // helper to fetch and parse JSON
  const fetchJson = async (url, opts) => {
    const res = await fetch(url, opts);
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${txt}`);
    }
  };

  // download URL → base64 via Supabase
  async function downloadToBase64(url) {
    log('Downloading image:', url);
    const { base64 } = await fetchJson(DOWNLOAD_IMAGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!base64) throw new Error('download_image failed');
    return base64;
  }

  // call Vision detect
  async function detect(base64) {
    log('Calling detect API');
    const { annotations } = await fetchJson(DETECT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    if (!Array.isArray(annotations)) throw new Error('detect API failed');
    return annotations;
  }

  // call reverse‐image‐search service
  async function reverseSearch(base64, annotation) {
    log('Reverse search for:', annotation.name);
    const res = await fetch(REVERSE_SEARCH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, annotations: [annotation] }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`reverse failed (${res.status}): ${body}`);
    }
    const json = await res.json();
    log('[Arcognition] raw reverseSearch response:', json);

    // API returns { success, data: [ { object, reverse: [...] } ] }
    const arr = Array.isArray(json.data)
      ? json.data
      : Array.isArray(json.results)
      ? json.results
      : Array.isArray(json.data?.results)
      ? json.data.results
      : [];

    if (!arr.length) return [];
    const entry = arr[0];
    return Array.isArray(entry.reverse) ? entry.reverse : [];
  }

  // file → base64
  function getBase64FromFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result.split(',')[1]);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  processBtn.addEventListener('click', async e => {
    e.preventDefault();
    processBtn.disabled = true;
    resultsBody.innerHTML = '';
    downloadLink.classList.add('hidden');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // 1) load image → base64 + preview
      let base64;
      if (fileInput.files.length) {
        base64 = await getBase64FromFile(fileInput.files[0]);
        preview.src = URL.createObjectURL(fileInput.files[0]);
      } else if (urlInput.value.trim()) {
        base64 = await downloadToBase64(urlInput.value.trim());
        preview.src = `data:image/jpeg;base64,${base64}`;
      } else {
        alert('Please select a file or enter an image URL.');
        return;
      }

      await new Promise(r => (preview.onload = r));
      const W = preview.naturalWidth,
        H = preview.naturalHeight;
      canvas.width = W;
      canvas.height = H;
      ctx.drawImage(preview, 0, 0);

      // 2) detect objects
      const annotations = await detect(base64);
      log('[Arcognition] Annotations found', annotations.length);
      if (!annotations.length) {
        alert('No objects detected.');
        return;
      }

      // 3) for each annotation: draw bbox → reverse search → render
      const excelRows = [];
      for (const ann of annotations) {
        const v = ann.boundingPoly.normalizedVertices;
        const x = v[0].x * W,
          y = v[0].y * H;
        const w = (v[1].x - v[0].x) * W,
          h = (v[3].y - v[0].y) * H;

        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        const matches = await reverseSearch(base64, ann);

        if (!matches.length) {
          resultsBody.insertAdjacentHTML(
            'beforeend',
            `<tr><td>${ann.name}</td><td colspan="2">No matches</td></tr>`
          );
          excelRows.push({ Item: ann.name, Site: '', Price: '', Link: '' });
        } else {
          matches.slice(0, 5).forEach(it => {
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

      // 4) generate Excel via SheetJS
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
