document.addEventListener('DOMContentLoaded', () => {
  const log = (...args) => console.log('[Arcognition]', ...args);

  // — UI ELEMENTS —
  const fileInput = document.getElementById('fileInput');
  const urlInput = document.getElementById('urlInput');
  const processBtn = document.getElementById('processBtn');
  const preview = document.getElementById('preview');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const resultsTable = document.getElementById('resultsTable');
  const resultsBody = document.getElementById('resultsBody');
  const downloadLink = document.getElementById('downloadLink');
  const dropZone = document.getElementById('dropZone');

  if (
    !fileInput ||
    !urlInput ||
    !processBtn ||
    !preview ||
    !canvas ||
    !ctx ||
    !resultsTable ||
    !resultsBody ||
    !downloadLink ||
    !dropZone
  ) {
    console.error('[Arcognition] Missing required UI elements');
    return;
  }

  // — API ENDPOINTS —
  const DOWNLOAD_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/download_image';
  const DETECT_API =
    'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1/detect';
  const REVERSE_API =
    'https://arcognition-search-490571042366.us-central1.run.app/reverse';

  // — HELPERS —
  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${txt}`);
    }
  }

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

  async function reverseSearch(base64, annotations) {
    log(
      'Calling reverse API for:',
      annotations.map(a => a.name)
    );
    const res = await fetch(REVERSE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, annotations }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Reverse API error (${res.status}): ${body}`);
    }
    const json = await res.json();
    log('Reverse raw response:', json);
    const data = Array.isArray(json.data)
      ? json.data
      : Array.isArray(json.results)
      ? json.results
      : null;
    if (!data) throw new Error('Unexpected reverseSearch response shape');
    return data;
  }

  function getBase64FromFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result.split(',')[1]);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // — Drag & Drop support —
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('border-blue-400');
  });
  dropZone.addEventListener('dragleave', e => {
    dropZone.classList.remove('border-blue-400');
  });
  dropZone.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-400');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      preview.src = URL.createObjectURL(e.dataTransfer.files[0]);
      preview.classList.remove('hidden');
      canvas.classList.add('hidden');
      resultsTable.classList.add('hidden');
    }
  });

  // — PROCESS BUTTON HANDLER —
  processBtn.addEventListener('click', async e => {
    e.preventDefault();
    processBtn.disabled = true;
    resultsBody.innerHTML = '';
    downloadLink.classList.add('hidden');
    resultsTable.classList.add('hidden');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // 1) Load image → base64 & preview
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

      // Show preview & canvas
      preview.classList.remove('hidden');
      canvas.classList.remove('hidden');

      // Draw on canvas
      const W = preview.naturalWidth,
        H = preview.naturalHeight;
      canvas.width = W;
      canvas.height = H;
      ctx.drawImage(preview, 0, 0);

      // 2) Detect
      const annotations = await detect(base64);
      log('Detected:', annotations);
      if (!annotations.length) {
        alert('No objects detected.');
        return;
      }
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
      log('Search results:', resultsArray);

      // Reveal the results table
      resultsTable.classList.remove('hidden');

      // 4) Render
      const excelRows = [];
      resultsArray.forEach(({ object, reverse }) => {
        if (!Array.isArray(reverse) || !reverse.length) {
          resultsBody.insertAdjacentHTML(
            'beforeend',
            `<tr><td>${object}</td><td colspan="2">No matches</td></tr>`
          );
          excelRows.push({ Item: object, Site: '', Price: '', Link: '' });
        } else {
          reverse.slice(0, 5).forEach(item => {
            resultsBody.insertAdjacentHTML(
              'beforeend',
              `<tr>
                 <td class="px-4 py-2">${object}</td>
                 <td class="px-4 py-2"><a href="${item.url}" target="_blank">${item.site}</a></td>
                 <td class="px-4 py-2">€${item.price_eur}</td>
               </tr>`
            );
            excelRows.push({
              Item: object,
              Site: item.site,
              Price: item.price_eur,
              Link: item.url,
            });
          });
        }
      });

      // 5) Excel export
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
