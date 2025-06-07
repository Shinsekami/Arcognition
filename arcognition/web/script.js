document.addEventListener('DOMContentLoaded', () => {
  const log = (...args) => console.log('[Arcognition]', ...args);

  // DOM elements
  const fileInput = document.querySelector('input[type="file"]');
  const urlInput =
    document.querySelector('#urlInput') ||
    document.querySelector('#imageUrl') ||
    document.querySelector('input[name="url"]');
  const processBtn =
    document.querySelector('#processBtn') ||
    document.querySelector('button[type="submit"]');
  const preview = document.querySelector('#preview');
  const canvas = document.querySelector('#canvas');
  const ctx = canvas?.getContext('2d');
  const resultsTable = document.querySelector('#resultsTable');
  const resultsBody = document.querySelector('#resultsBody');
  const downloadLink = document.querySelector('#downloadLink');

  if (!processBtn || !preview || !canvas || !ctx || !resultsBody) {
    console.error('Required elements missing');
    return;
  }
  log('DOM ready');

  // API endpoints
  const SUPABASE_URL = 'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1';
  const DOWNLOAD_IMAGE_API = `${SUPABASE_URL}/download_image`;
  const DETECT_API = `${SUPABASE_URL}/detect`;
  const REVERSE_SEARCH_API =
    'https://arcognition-search-skujvj7jba-uc.a.run.app/reverse';

  // Fetch JSON helper
  const fetchJson = (url, opts) =>
    fetch(url, opts).then(async res => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON from ${url}: ${text}`);
      }
    });

  // Download remote image as base64
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

  // Detect furniture objects
  async function detect(base64) {
    log('Calling detect API');
    const res = await fetchJson(DETECT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    if (!Array.isArray(res.annotations)) throw new Error('detect failed');
    log('Annotations received:', res.annotations.length);
    return res.annotations;
  }

  // Reverse‐image search via Cloud Run
  async function reverseSearch(base64, annotation) {
    log('Reverse search for:', annotation.name);
    const res = await fetch(REVERSE_SEARCH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, annotations: [annotation] }),
    });
    log('Status:', res.status);
    const json = await res.json();
    const results = json.data?.results;
    log('Results count:', results?.length || 0);
    return Array.isArray(results) ? results : [];
  }

  // Draw bounding boxes
  function drawBoxes(anns) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    anns.forEach(a => {
      const { x, y, w, h } = a.bbox;
      ctx.strokeRect(x, y, w, h);
    });
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
      canvas.width = preview.naturalWidth;
      canvas.height = preview.naturalHeight;
      canvas.classList.remove('hidden');
      ctx.drawImage(preview, 0, 0);

      // 2) Detect
      const annotations = await detect(base64);
      if (!annotations.length) {
        alert('No objects detected');
        return;
      }
      drawBoxes(annotations);

      // 3) Reverse search & render
      const excelRows = [];
      resultsTable.classList.remove('hidden');
      for (const ann of annotations) {
        const items = await reverseSearch(base64, ann);
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
                <td>€${it.price_eur ?? ''}</td>
              </tr>`
            );
            excelRows.push({
              Item: ann.name,
              Site: it.site,
              Price: it.price_eur ?? '',
              Link: it.url,
            });
          });
        }
      }

      // 4) Excel export
      log('Generating Excel rows:', excelRows.length);
      if (excelRows.length) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelRows);
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], {
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
