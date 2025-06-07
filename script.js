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
  const DOWNLOAD_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/download_image';
  const DETECT_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/detect';
  const REVERSE_API =
    'https://arcognition-search-490571042366.us-central1.run.app/reverse';

  // Helper to fetch and parse JSON
  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${txt}`);
    }
  }

  // Download URL → base64 via Supabase
  async function downloadToBase64(url) {
    log('Downloading image:', url);
    const { base64 } = await fetchJson(DOWNLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!base64) throw new Error('download_image failed');
    return base64;
  }

  // Call detect API
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

  // Call reverse‐image‐search service
  async function reverseSearch(base64, annotations) {
    log(
      'Reverse search for annotations:',
      annotations.map(a => a.name)
    );
    const res = await fetch(REVERSE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, annotations }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`reverse failed (${res.status}): ${body}`);
    }
    const json = await res.json();
    log('[Arcognition] raw reverseSearch response:', json);
    // Expect json.data = [ { object, reverse:[…] }, … ]
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error('Unexpected reverseSearch response shape');
    }
    return json.data;
  }

  // File → base64
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
      // 1) Load image → base64 + preview
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

      // 2) Detect objects
      const annotations = await detect(base64);
      log('[Arcognition] Annotations found', annotations.length);
      if (!annotations.length) {
        alert('No objects detected.');
        return;
      }

      // Draw all bounding boxes
      annotations.forEach(ann => {
        const v = ann.boundingPoly.normalizedVertices;
        const x = v[0].x * W,
          y = v[0].y * H;
        const w = (v[1].x - v[0].x) * W,
          h = (v[3].y - v[0].y) * H;
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
      });

      // 3) Reverse search
      const resultsArray = await reverseSearch(base64, annotations);

      // 4) Render each object’s results
      const excelRows = [];
      resultsArray.forEach(({ object, reverse }) => {
        if (!reverse.length) {
          resultsBody.insertAdjacentHTML(
            'beforeend',
            `<tr><td>${object}</td><td colspan="2">No matches</td></tr>`
          );
          excelRows.push({ Item: object, Site: '', Price: '', Link: '' });
        } else {
          reverse.slice(0, 5).forEach(it => {
            resultsBody.insertAdjacentHTML(
              'beforeend',
              `<tr>
                 <td>${object}</td>
                 <td><a href="${it.url}" target="_blank">${it.site}</a></td>
                 <td>€${it.price_eur}</td>
               </tr>`
            );
            excelRows.push({
              Item: object,
              Site: it.site,
              Price: it.price_eur,
              Link: it.url,
            });
          });
        }
      });

      // 5) Generate Excel via SheetJS
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
