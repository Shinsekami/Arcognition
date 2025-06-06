const GOOGLE_API_KEY = "AIzaSyDFPzGNHo_YYKZBWzDzKuxroncrgV6tGrw";
const API_URL = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;

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

imageUrlInput.addEventListener('input', () => {
    imageUrl = imageUrlInput.value.trim();
    selectedFile = null;
    if (imageUrl) {
        showPreview(imageUrl);
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

async function getImageBase64() {
    if (selectedFile) {
        return await blobToBase64(selectedFile);
    }
    const res = await fetch(imageUrl);
    const blob = await res.blob();
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
        const base64 = await getImageBase64();
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
