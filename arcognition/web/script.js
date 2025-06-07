document.addEventListener('DOMContentLoaded', () => {
  // Grab elements safely
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

  if (!processBtn || !preview || !canvas || !ctx) {
    console.error('Required elements missing');
    return;
  }

  /* ---------- API endpoints ---------- */
  const SUPABASE = 'https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1';
  const DOWNLOAD_IMAGE_API = `${SUPABASE}/download_image`;
  const DETECT_API = `${SUPABASE}/detect`;
  const REVERSE_SEARCH_API =
    'https://arcognition-search-skujvj7jba-uc.a.run.app/reverse';
  /* ---------- helper wrappers ---------- */
  const fetchJson = (url, opts) => fetch(url, opts).then(r => r.json());

  function drawBoxes(anns) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    anns.forEach(a => {
      const { x, y, w, h } = a.bbox || {};
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    });
  }

  async function cropBlobFromBox(img, box) {
    const c = document.createElement('canvas');
    c.width = box.w;
    c.height = box.h;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    return await new Promise(res => c.toBlob(res, 'image/jpeg'));
  }

  async function downloadToBase64(url) {
    const res = await fetchJson(DOWNLOAD_IMAGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) throw new Error(`download_image: ${res.detail}`);
    return res.base64;
  }

  async function detect(base64) {
    const res = await fetchJson(DETECT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    if (!res.ok) throw new Error(`Vision API: ${res.stage} – ${res.detail}`);
    return res.annotations;
  }

  async function reverseSearch(fullBase64Image, annotation) {
    console.log('🔍 reverseSearch payload:', {
      base64: fullBase64Image,
      annotations: [annotation],
    });
    const res = await fetch(REVERSE_SEARCH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64: fullBase64Image,
        annotations: [annotation],
      }),
    });
    console.log('🔍 reverseSearch status:', res.status, res.statusText);
    const text = await res.text();
    console.log('🔍 reverseSearch raw response:', text);
    try {
      const json = JSON.parse(text);
      console.log('🔍 reverseSearch parsed JSON:', json);
      return json;
    } catch (err) {
      console.error('🔍 reverseSearch JSON parse error:', err);
      throw err;
    }
  }

  /* ---------- main click handler ---------- */
  processBtn.addEventListener('click', async e => {
    e.preventDefault();
    processBtn.disabled = true;
    resultsBody.innerHTML = '';
    downloadLink.classList.add('hidden');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    try {
      // 1. Get base64 + preview
      let base64, blob;
      if (fileInput && fileInput.files.length) {
        blob = fileInput.files[0];
        base64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result.split(',')[1]);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        preview.src = URL.createObjectURL(blob);
      } else if (urlInput && urlInput.value.trim()) {
        base64 = await downloadToBase64(urlInput.value.trim());
        blob = await fetch(`data:image/jpeg;base64,${base64}`).then(r =>
          r.blob()
        );
        preview.src = `data:image/jpeg;base64,${base64}`;
      } else {
        alert('Provide an image file or URL');
        processBtn.disabled = false;
        return;
      }

      await new Promise(r => (preview.onload = r));
      canvas.width = preview.naturalWidth;
      canvas.height = preview.naturalHeight;
      canvas.classList.remove('hidden');
      ctx.drawImage(preview, 0, 0);

      // 2. Detect objects
      const annotations = await detect(base64);
      const excelRows = [];

      // 3. For each detected item, send full base64 + annotation to your server
      for (const ann of annotations) {
        // optional local thumbnail
        const cropBlob = await cropBlobFromBox(preview, ann.bbox);
        const thumbnailURL = URL.createObjectURL(cropBlob);

        // server‐side reverse search
        let items = [];
        try {
          const res = await reverseSearch(base64, ann);
          items = res.data?.results || [];
        } catch (err) {
          console.warn('reverseSearch failed', err);
        }

        if (!items.length) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${ann.name}</td><td colspan="2">No matches found</td>`;
          resultsBody.appendChild(tr);
          excelRows.push({ Item: ann.name, Site: '', Price: '', Link: '' });
          continue;
        }

        // render up to 5 results per item
        items.slice(0, 5).forEach(it => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${ann.name}</td>
            <td><a href="${it.url}" target="_blank">${it.site}</a></td>
            <td>€${it.price_eur ?? ''}</td>
            <td><img src="${
              it.thumbnail
            }" class="w-12 h-12 object-contain" /></td>
          `;
          resultsBody.appendChild(tr);
          excelRows.push({
            Item: ann.name,
            Site: it.site,
            Price: it.price_eur ?? '',
            Link: it.url,
          });
        });
      }

      // 4. Build & download Excel
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const excelBlob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      downloadLink.href = URL.createObjectURL(excelBlob);
      downloadLink.download = 'arcognition_report.xlsx';
      downloadLink.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      processBtn.disabled = false;
    }
  });
});
