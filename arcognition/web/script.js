document.addEventListener("DOMContentLoaded", () => {
  // Grab elements safely
  const fileInput  = document.querySelector('input[type="file"]');
  const urlInput   =
    document.querySelector('#urlInput') ||
    document.querySelector('#imageUrl') ||
    document.querySelector('input[name="url"]');
  const processBtn = document.querySelector('#processBtn') || document.querySelector('button[type="submit"]');

  if (!processBtn) {
    console.error("processBtn not found"); return;
  }

  /* ---------- API endpoints ---------- */
  const SUPABASE = "https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1";
  const DOWNLOAD_IMAGE_API = `${SUPABASE}/download_image`;
  const DETECT_API         = `${SUPABASE}/detect`;
  const REVERSE_SEARCH_API =
    "https://arcognition-search-490571042366.us-central1.run.app/reverse";

  /* ---------- helper wrappers ---------- */
  const fetchJson = (url, opts) => fetch(url, opts).then(r => r.json());

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
    try {
      // 1. get image as base64
      let base64;
      if (fileInput && fileInput.files.length) {
        base64 = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result.split(",")[1]);
          fr.onerror = reject;
          fr.readAsDataURL(fileInput.files[0]);
        });
      } else if (urlInput && urlInput.value.trim()) {
        base64 = await downloadToBase64(urlInput.value.trim());
      } else {
        alert("Provide an image file or URL"); return;
      }

      // 2. detect objects
      const annotations = await detect(base64);
      if (!annotations.length) { alert("No objects found"); return; }

      // 3. (demo) run reverse search on full image
      const blob = fileInput?.files[0] ??
                   await fetch(`data:image/jpeg;base64,${base64}`).then(r=>r.blob());
      const matches = await reverseSearch(blob);

      console.log({ annotations, matches });
      alert("Finished – open console for details");
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });
});
