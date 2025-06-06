const BACKEND_PIPELINE_URL = "https://your-cloud-run-url/image-process";

const imageFileInput = document.getElementById('imageFile');
const imageUrlInput = document.getElementById('imageUrl');
const dropZone = document.getElementById('dropZone');
const previewImg = document.getElementById('preview');
const processBtn = document.getElementById('processBtn');
const downloadLink = document.getElementById('downloadLink');

let selectedFile = null;
let imageUrl = '';

function showPreview(src) {
    previewImg.src = src;
    previewImg.classList.remove('hidden');
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
    imageUrl = imageUrlInput.value;
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

processBtn.addEventListener('click', async () => {
    if (!selectedFile && !imageUrl) {
        alert('Please provide an image file or URL.');
        return;
    }

    processBtn.disabled = true;
    processBtn.textContent = 'Processing...';
    downloadLink.classList.add('hidden');

    try {
        let response;
        if (selectedFile) {
            const formData = new FormData();
            formData.append('image', selectedFile);
            response = await fetch(BACKEND_PIPELINE_URL, {
                method: 'POST',
                body: formData
            });
        } else {
            response = await fetch(BACKEND_PIPELINE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_url: imageUrl })
            });
        }

        if (!response.ok) {
            throw new Error('Server error');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = 'arcognition_report.xlsx';
        downloadLink.classList.remove('hidden');
    } catch (err) {
        alert('Failed to process image.');
        console.error(err);
    } finally {
        processBtn.disabled = false;
        processBtn.textContent = 'Process';
    }
});
