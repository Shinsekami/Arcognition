const GOOGLE_API_KEY = "AIzaSyDFPzGNHo_YYKZBWzDzKuxroncrgV6tGrw";
const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
const REVERSE_SEARCH_API = "https://arcognition-search-<your-region>.a.run.app/reverse";
const DOWNLOAD_IMAGE_URL = "https://arcognition-api-<your-cloud-run>.a.run.app/download-image";

const imageFileInput = document.getElementById('imageFile');
const imageUrlInput = document.getElementById('imageUrl');
const dropZone = document.getElementById('dropZone');
const previewImg = document.getElementById('preview');
const canvas = document.getElementById('canvas');
const processBtn = document.getElementById('processBtn');
const downloadLink = document.getElementById('downloadLink');
const resultsTable = document.getElementById('resultsTable');
const resultsBody = document.getElementById('resultsBody');

let selectedFile = null;
let imageUrl = '';
let resultsData = [];
let reverseLinks = [];

function showPreview(src) {
    previewImg.src = src;
    previewImg.classList.remove('hidden');
    canvas.classList.add('hidden');
}

imageFileInput.addEventListener('change', () => {
    if (imageFileInput.files && imageFileInput.files[0]) {
        selectedFile = imageFileInput.files[0];
        imageUrlInput.value = '';
        imageUrl = '';
        const reader = new FileReader();
        reader.onload = e => showPreview(e.target.result);
        reader.readAsDataURL(selectedFile);
    }
});

imageUrlInput.addEventListener('input', async () => {
    imageUrl = imageUrlInput.value.trim();
    selectedFile = null;
    if (imageUrl) {
        try {
            const resp = await fetch(DOWNLOAD_IMAGE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: imageUrl })
            });
            if (resp.ok) {
                const data = await resp.json();
                showPreview('data:image/jpeg;base64,' + data.base64);
            } else {
                showPreview('');
            }
        } catch {
            showPreview('');
        }
    }
});

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('bg-gray-200');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('bg-gray-200');
});

dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('bg-gray-200');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectedFile = e.dataTransfer.files[0];
        imageFileInput.value = '';
        imageUrlInput.value = '';
        imageUrl = '';
        const reader = new FileReader();
        reader.onload = ev => showPreview(ev.target.result);
        reader.readAsDataURL(selectedFile);
    }
});

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64) {
    const binStr = atob(base64);
    const len = binStr.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = binStr.charCodeAt(i);
    }
    return new Blob([arr], { type: 'image/jpeg' });
}

async function getImageBlob() {
    if (selectedFile) {
        return selectedFile;
    }
    const resp = await fetch(DOWNLOAD_IMAGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl })
    });
    if (!resp.ok) throw new Error('Download failed');
    const data = await resp.json();
    const base64 = data.base64;
    return base64ToBlob(base64);
}

async function getImageBase64() {
    const blob = await getImageBlob();
    return await blobToBase64(blob);
}

function drawBoxes(annotations) {
    const ctx = canvas.getContext('2d');
    canvas.width = previewImg.naturalWidth;
    canvas.height = previewImg.naturalHeight;
    ctx.drawImage(previewImg, 0, 0);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    annotations.forEach(a => {
        const verts = a.boundingPoly.normalizedVertices;
        const xs = verts.map(v => v.x || 0);
        const ys = verts.map(v => v.y || 0);
        const x = Math.min(...xs) * canvas.width;
        const y = Math.min(...ys) * canvas.height;
        const w = (Math.max(...xs) - Math.min(...xs)) * canvas.width;
        const h = (Math.max(...ys) - Math.min(...ys)) * canvas.height;
        ctx.strokeRect(x, y, w, h);
    });
    previewImg.classList.add('hidden');
    canvas.classList.remove('hidden');
}

function fillTable(annotations) {
    resultsBody.innerHTML = '';
    resultsData = annotations.map(a => ({
        Item: a.name,
        Score: +(a.score * 100).toFixed(1)
    }));
    resultsData.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `<td class="border px-2 py-1">${item.Item}</td><td class="border px-2 py-1">${item.Score}%</td>`;
        resultsBody.appendChild(row);
    });
    resultsTable.classList.remove('hidden');
}

async function reverseSearch(blob) {
    const file = blob instanceof File ? blob : new File([blob], 'image.jpg');
    const formData = new FormData();
    formData.append('image', file);
    const resp = await fetch(REVERSE_SEARCH_API, {
        method: 'POST',
        body: formData
    });
    if (!resp.ok) throw new Error('Reverse search error');
    const data = await resp.json();
    return data.urls || data.links || [];
}

processBtn.addEventListener('click', async () => {
    if (!selectedFile && !imageUrl) {
        alert('Please provide an image file or URL.');
        return;
    }

    processBtn.disabled = true;
    processBtn.textContent = 'Processing...';
    downloadLink.classList.add('hidden');
    resultsTable.classList.add('hidden');

    try {
        const blob = await getImageBlob();
        const base64 = await blobToBase64(blob);
        const payload = {
            requests: [{
                image: { content: base64 },
                features: [{ type: 'OBJECT_LOCALIZATION' }]
            }]
        };
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Vision API error');
        const data = await response.json();
        const annotations = data.responses?.[0]?.localizedObjectAnnotations || [];
        drawBoxes(annotations);
        fillTable(annotations);
        reverseLinks = await reverseSearch(blob);
        console.log('Reverse search links:', reverseLinks);
        downloadLink.classList.remove('hidden');
    } catch (err) {
        console.error(err);
        alert('Failed to process image.');
    } finally {
        processBtn.disabled = false;
        processBtn.textContent = 'Process';
    }
});

downloadLink.addEventListener('click', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(resultsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'arcognition_report.xlsx');
});
