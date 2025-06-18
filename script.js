document.addEventListener("DOMContentLoaded", () => {
  const log = (...args) => console.log('[Arcognition]', ...args);
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
  log('DOM loaded');

  /* ---------- API endpoints ---------- */
  const BACKEND_BASE = "https://arcognition-api-xxxxx.a.run.app"; // replace with your Cloud Run URL
  const DOWNLOAD_IMAGE_API = `${BACKEND_BASE}/download-image`;
  const DETECT_API = `${BACKEND_BASE}/detect`;
  const REVERSE_SEARCH_API =
    "https://arcognition-search-490571042366.us-central1.run.app/reverse";

  /* ---------- helper wrappers ---------- */
  const fetchJson = async (url, opts) => {
    log('fetch', url);
    const res = await fetch(url, opts);
    let data;
    try {
      data = await res.json();
    } catch (err) {
      log('Failed to parse JSON', err);
      throw err;
    }
    if (!res.ok) {
      log('HTTP error', res.status, data);
    }
    return data;
  };

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
    log('Downloading image', url);
    const res = await fetchJson(DOWNLOAD_IMAGE_API, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({url})
    });
    if (!res.ok) {
      log('download_image failed', res);
      throw new Error(`download_image: ${res.detail}`);
    }
    log('Downloaded image - length', res.base64?.length);
    return res.base64;
  }

  async function detect(base64) {
    log('Calling detect API');
    const res = await fetchJson(DETECT_API, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({base64})
    });
    if (!res.ok) {
      log('detect failed', res);
      throw new Error(`Vision API: ${res.stage} – ${res.detail}`);
    }
    log('Detection success, annotations', res.annotations);
    if (!Array.isArray(res.annotations)) {
      log('Unexpected detection response', res);
    }
    return res.annotations;
  }

  async function reverseSearch(blob) {
    log('Calling reverse search');
    const fd = new FormData();
    fd.append("image", blob, "crop.jpg");
    const res = await fetchJson(REVERSE_SEARCH_API, {method:"POST", body:fd});
    log('Reverse search response', res);
    return res;
  }

  /* ---------- main click handler ---------- */
  processBtn.addEventListener("click", async e => {
    e.preventDefault();
    log('Process button clicked');
    processBtn.disabled = true;
    resultsBody.innerHTML = "";
    downloadLink.classList.add("hidden");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      // 1. get image as base64 and preview
      let base64, blob;
      if (fileInput && fileInput.files.length) {
        blob = fileInput.files[0];
        base64 = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result.split(",")[1]);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        preview.src = URL.createObjectURL(blob);
      } else if (urlInput && urlInput.value.trim()) {
        base64 = await downloadToBase64(urlInput.value.trim());
        blob = await fetch(`data:image/jpeg;base64,${base64}`).then(r => r.blob());
        preview.src = `data:image/jpeg;base64,${base64}`;
      } else {
        alert("Provide an image file or URL");
        return;
      }

      log('Image prepared', { fromFile: !!(fileInput && fileInput.files.length), length: base64.length });

      await new Promise(res => (preview.onload = res));
      canvas.width = preview.naturalWidth;
      canvas.height = preview.naturalHeight;
      canvas.classList.remove("hidden");

      // 2. detect objects
      const annotations = await detect(base64);
      if (!annotations.length) {
        alert("No objects found");
        return;
      }

      log('Annotations found', annotations.length);

      drawBoxes(annotations);

      const excelRows = [];
      for (const ann of annotations) {
        log('Annotation object', ann);
        if (!ann.bbox) {
          log('No bbox for annotation', ann);
          continue;
        }
        log('Processing item', ann.name, ann.bbox);
        let crop;
        try {
          log('Cropping image');
          crop = await cropBlobFromBox(preview, ann.bbox);
          log('Crop ready', crop.size);
          log('Crop preview URL', URL.createObjectURL(crop));
        } catch (err) {
          console.error('Crop failed', err);
          continue;
        }
        log('Sending to reverse search');
        let items = [];
        try {
          const res = await reverseSearch(crop);
          items = res.results || [];
          log('Reverse search results', items.length);
        } catch (err) {
          console.error('reverseSearch failed', err);
        }
        if (!items.length) {
          log('No matches for', ann.name);
          const tr = document.createElement("tr");
          tr.innerHTML = `<td class="px-2 py-1">${ann.name}</td><td class="px-2 py-1" colspan="2">No matches found</td>`;
          resultsBody.appendChild(tr);
          excelRows.push({ Item: ann.name, Site: '', Price: '', Link: '' });
          continue;
        }
        log('Adding rows for', ann.name);
        items.slice(0, 5).forEach((it) => {
          const tr = document.createElement("tr");
          const thumb = it.thumbnail ? `<img src="${it.thumbnail}" class="w-12 h-12 object-contain" />` : "";
          tr.innerHTML = `<td class="px-2 py-1">${ann.name}</td><td class="px-2 py-1"><a href="${it.url}" target="_blank" class="text-blue-600 underline">${it.site}</a></td><td class="px-2 py-1">${it.price_eur ?? ""}</td><td class="px-2 py-1">${thumb}</td>`;
          resultsBody.appendChild(tr);
          const row = { Item: ann.name, Site: it.site, Price: it.price_eur, Link: it.url };
          excelRows.push(row);
          log('Row added', row);
        });
      }
      resultsTable.classList.remove("hidden");

      log('Generating Excel with rows', excelRows.length);

      if (excelRows.length) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelRows);
        XLSX.utils.book_append_sheet(wb, ws, "Results");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const excelBlob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        downloadLink.href = URL.createObjectURL(excelBlob);
        downloadLink.download = "arcognition_report.xlsx";
        downloadLink.classList.remove("hidden");
        log('Excel ready for download');
      }

    } catch (err) {
      console.error(err);
      log('Processing failed', err);
      alert(err.message);
    } finally {
      processBtn.disabled = false;
    }
  });
});
