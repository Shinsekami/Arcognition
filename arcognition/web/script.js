document.addEventListener("DOMContentLoaded", () => {
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
  const SUPABASE = "https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1";
  const DOWNLOAD_IMAGE_API = `${SUPABASE}/download_image`;
  const DETECT_API         = `${SUPABASE}/detect`;
  const REVERSE_SEARCH_API =
    "https://arcognition-search-490571042366.us-central1.run.app/reverse";

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
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({url})
    });
    if (!res.ok) throw new Error(`download_image: ${res.detail}`);
    return res.base64;
  }

  async function detect(base64) {
    const res = await fetchJson(DETECT_API, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({base64})
    });
    if (!res.ok) throw new Error(`Vision API: ${res.stage} – ${res.detail}`);
    return res.annotations;
  }

  async function reverseSearch(blob) {
    const fd = new FormData();
    fd.append("image", blob, "crop.jpg");
    const res = await fetchJson(REVERSE_SEARCH_API, {method:"POST", body:fd});
    return res;
  }

  /* ---------- main click handler ---------- */
  processBtn.addEventListener("click", async e => {
    e.preventDefault();
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

      drawBoxes(annotations);

      const excelRows = [];
      for (const ann of annotations) {
        if (!ann.bbox) continue;
        const crop = await cropBlobFromBox(preview, ann.bbox);
        let items = [];
        try {
          const res = await reverseSearch(crop);
          items = res.results || [];
        } catch (err) {
          console.warn('reverseSearch failed', err);
        }
        if (!items.length) {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td class="px-2 py-1">${ann.name}</td><td class="px-2 py-1" colspan="2">No matches found</td>`;
          resultsBody.appendChild(tr);
          excelRows.push({ Item: ann.name, Site: '', Price: '', Link: '' });
          continue;
        }
        items.slice(0, 5).forEach((it) => {
          const tr = document.createElement("tr");
          const thumb = it.thumbnail ? `<img src="${it.thumbnail}" class="w-12 h-12 object-contain" />` : "";
          tr.innerHTML = `<td class="px-2 py-1">${ann.name}</td><td class="px-2 py-1"><a href="${it.url}" target="_blank" class="text-blue-600 underline">${it.site}</a></td><td class="px-2 py-1">${it.price_eur ?? ""}</td><td class="px-2 py-1">${thumb}</td>`;
          resultsBody.appendChild(tr);
          excelRows.push({ Item: ann.name, Site: it.site, Price: it.price_eur, Link: it.url });
        });
      }
      resultsTable.classList.remove("hidden");

      if (excelRows.length) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelRows);
        XLSX.utils.book_append_sheet(wb, ws, "Results");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const excelBlob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        downloadLink.href = URL.createObjectURL(excelBlob);
        downloadLink.download = "arcognition_report.xlsx";
        downloadLink.classList.remove("hidden");
      }

    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      processBtn.disabled = false;
    }
  });
});
