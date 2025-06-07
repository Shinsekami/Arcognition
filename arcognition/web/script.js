/* Arcognition front-end logic  —  clean, conflict-free */

const SUPABASE_BASE      = "https://kwyictzrlgvuqtbxsxgz.supabase.co/functions/v1";
const DOWNLOAD_IMAGE_API = `${SUPABASE_BASE}/download_image`;
const DETECT_API         = `${SUPABASE_BASE}/detect`;
const REVERSE_SEARCH_API =
  "https://arcognition-search-490571042366.us-central1.run.app/reverse";  // Cloud-Run

// ---------- helpers ----------
async function callDetect(base64) {
  const r = await fetch(DETECT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64 })
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Vision API error: ${data.stage} – ${data.detail}`);
  return data.annotations;
}

async function reverseSearch(cropBlob) {
  const form = new FormData();
  form.append("image", cropBlob, "crop.jpg");
  const r = await fetch(REVERSE_SEARCH_API, { method: "POST", body: form });
  if (!r.ok) throw new Error("Reverse search failed");
  return r.json(); // array of URLs
}

async function getImageBlobFromUrl(url) {
  const r = await fetch(DOWNLOAD_IMAGE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Download failed: ${data.detail}`);
  return atob(data.base64);
}

// ---------- main UI ----------
const fileInput   = document.querySelector("#fileInput");
const urlInput    = document.querySelector("#urlInput");
const processBtn  = document.querySelector("#processBtn");

processBtn.addEventListener("click", async () => {
  try {
    // 1) get image as base64
    let base64;
    if (fileInput.files.length) {
      base64 = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result.split(",")[1]);
        fr.onerror = rej;
        fr.readAsDataURL(fileInput.files[0]);
      });
    } else if (urlInput.value.trim()) {
      base64 = (await fetch(DOWNLOAD_IMAGE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.value.trim() })
      }).then(r => r.json())).base64;
    } else {
      alert("Provide an image or URL"); return;
    }

    // 2) detect objects
    const annotations = await callDetect(base64);

    // 3) for each object run reverse search (demo: first only)
    if (!annotations.length) { alert("No objects found"); return; }

    const cropBlob = fileInput.files[0];        // placeholder: use original for demo
    const matches  = await reverseSearch(cropBlob);

    console.log("Annotations →", annotations);
    console.log("Reverse matches →", matches);
    alert("Pipeline finished – check console for results");
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
});
