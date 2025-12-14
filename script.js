// Global variables
let selectedFile = null;
let resultImageUrl = null;
let progressInterval = null;

// DOM Elements
let bgLoader, fileInput, uploadBox, previewContainer, previewImage;
let removeBtn, generateBtn, uploadSection, processingLoader, resultSection;
let resultImage, downloadBtn, resetBtn, errorMessage, errorText;

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    // Get all DOM elements
    bgLoader = document.getElementById('bgLoader');
    fileInput = document.getElementById('fileInput');
    uploadBox = document.getElementById('uploadBox');
    previewContainer = document.getElementById('previewContainer');
    previewImage = document.getElementById('previewImage');
    removeBtn = document.getElementById('removeBtn');
    generateBtn = document.getElementById('generateBtn');
    uploadSection = document.getElementById('uploadSection');
    processingLoader = document.getElementById('processingLoader');
    resultSection = document.getElementById('resultSection');
    resultImage = document.getElementById('resultImage');
    downloadBtn = document.getElementById('downloadBtn');
    resetBtn = document.getElementById('resetBtn');
    errorMessage = document.getElementById('errorMessage');
    errorText = document.getElementById('errorText');

    if (!bgLoader) {
        console.error('Required DOM elements not found!');
        return;
    }

    initBackgroundLoading();
    initEventListeners();
}

function initBackgroundLoading() {
    bgLoader.classList.remove('hidden');
    let loadingComplete = false;

    const bg = new Image();
    bg.src = './tdr.png';

    const hideLoader = () => {
        if (!loadingComplete) {
            loadingComplete = true;
            bgLoader.classList.add('hidden');
            document.body.classList.add('loaded');
        }
    };

    bg.onload = () => {
        console.log('Background loaded');
        setTimeout(hideLoader, 800);
    };

    bg.onerror = () => {
        console.log('Background failed, continuing...');
        setTimeout(hideLoader, 800);
    };

    setTimeout(() => {
        if (!loadingComplete) hideLoader();
    }, 3000);
}

function initEventListeners() {
    uploadBox.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('drag-over');
    });
    
    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('drag-over');
    });
    
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('drag-over');
        handleFile(e.dataTransfer.files[0]);
    });

    removeBtn.addEventListener('click', handleRemoveImage);
    generateBtn.addEventListener('click', handleGenerate);
    downloadBtn.addEventListener('click', handleDownload);
    resetBtn.addEventListener('click', handleReset);
}

function handleFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showError('Please upload a valid image file');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        showError('File size must be less than 10MB');
        return;
    }

    selectedFile = file;
    const reader = new FileReader();
    
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        uploadBox.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        generateBtn.disabled = false;
        hideError();
    };
    
    reader.onerror = () => showError('Failed to read file');
    reader.readAsDataURL(file);
}

function handleRemoveImage() {
    selectedFile = null;
    fileInput.value = '';
    previewImage.src = '';
    previewContainer.classList.add('hidden');
    uploadBox.classList.remove('hidden');
    generateBtn.disabled = true;
    hideError();
}

async function handleGenerate() {
    if (!selectedFile) return;

    try {
        uploadSection.classList.add('hidden');
        processingLoader.classList.remove('hidden');
        hideError();
        
        updateLoadingMessage('Uploading and processing... This usually takes 30-40 seconds');
        startProgressTimer();

        console.log('Starting process for:', selectedFile.name);
        
        const base64 = await fileToBase64(selectedFile);
        const result = await processImage(base64);
        
        stopProgressTimer();
        console.log('Success! Result:', result.result);
        
        resultImageUrl = result.result;
        resultImage.src = result.result;
        processingLoader.classList.add('hidden');
        resultSection.classList.remove('hidden');

    } catch (error) {
        console.error('Error:', error);
        stopProgressTimer();
        processingLoader.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        showError(error.message || 'An error occurred. Please try again.');
    }
}

// Process via Railway server (NO TIMEOUT!)
async function processImage(base64) {
    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image: base64.split(',')[1],
                filename: selectedFile.name,
                mimetype: selectedFile.type
            })
        });

        console.log('API response status:', response.status);

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error('Server returned invalid response');
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Processing failed');
        }

        if (!data.result) {
            throw new Error('No result from API');
        }

        console.log('Timing:', data.timing);
        return data;
        
    } catch (error) {
        console.error('Process error:', error);
        throw error;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            reject(error);
        };
        reader.readAsDataURL(file);
    });
}

function updateLoadingMessage(message) {
    const loadingText = processingLoader.querySelector('p');
    if (loadingText) loadingText.textContent = message;
}

function startProgressTimer() {
    let seconds = 0;
    const loadingText = processingLoader.querySelector('p');
    
    progressInterval = setInterval(() => {
        seconds++;
        if (seconds <= 40) {
            loadingText.textContent = `Processing... ${seconds}s (usually 30-40s)`;
        } else if (seconds <= 55) {
            loadingText.textContent = `Still processing... ${seconds}s. Almost done!`;
        } else {
            loadingText.textContent = `Taking longer... ${seconds}s. Please wait...`;
        }
    }, 1000);
}

function stopProgressTimer() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

// Native browser download dengan progress bar
function handleDownload() {
    if (!resultImageUrl) return;

    try {
        console.log('Starting download...');
        
        // Generate random filename (8 karakter acak)
        const randomName = generateRandomFilename();
        
        // Native browser download - akan muncul progress bar di browser
        const downloadUrl = `/api/download?url=${encodeURIComponent(resultImageUrl)}&filename=${randomName}`;
        
        // Buat link dan klik - trigger native download dengan progress
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = randomName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        console.log('Download started:', randomName);
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to start download. Please try again.');
    }
}

// Generate random filename
function generateRandomFilename() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let random = '';
    for (let i = 0; i < 8; i++) {
        random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `result_${random}.png`;
}

function handleReset() {
    selectedFile = null;
    resultImageUrl = null;
    fileInput.value = '';
    previewImage.src = '';
    resultImage.src = '';
    
    resultSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    uploadBox.classList.remove('hidden');
    generateBtn.disabled = true;
    hideError();
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}