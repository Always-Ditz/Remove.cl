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

        console.log('=== STEP 1: Converting file to base64 ===');
        console.log('File info:', {
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type
        });
        
        const base64 = await fileToBase64(selectedFile);
        console.log('✓ Base64 conversion successful, length:', base64.length);
        
        console.log('=== STEP 2: Sending to server ===');
        const result = await processImage(base64);
        
        stopProgressTimer();
        console.log('=== STEP 3: Success! ===');
        console.log('Result URL:', result.result);
        console.log('Upload URL:', result.uploadedUrl);
        console.log('Timing:', result.timing);
        
        resultImageUrl = result.result;
        resultImage.src = result.result;
        processingLoader.classList.add('hidden');
        resultSection.classList.remove('hidden');

    } catch (error) {
        console.error('=== ERROR OCCURRED ===');
        console.error('Error type:', error.name);
        console.error('Error message:', error.message);
        console.error('Full error:', error);
        
        stopProgressTimer();
        processingLoader.classList.add('hidden');
        uploadSection.classList.remove('hidden');
        showError(error.message || 'An error occurred. Please try again.');
    }
}

// Process via Railway server with enhanced debugging
async function processImage(base64) {
    try {
        console.log('→ Preparing request payload...');
        const payload = {
            image: base64.split(',')[1],
            filename: selectedFile.name,
            mimetype: selectedFile.type
        };
        console.log('→ Payload size:', JSON.stringify(payload).length, 'bytes');
        
        console.log('→ Sending POST to /api/process...');
        const startTime = Date.now();
        
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120000) // 2 minute timeout
        });

        const requestTime = Date.now() - startTime;
        console.log('→ Response received in', requestTime, 'ms');
        console.log('→ Response status:', response.status, response.statusText);
        console.log('→ Response headers:', {
            contentType: response.headers.get('content-type'),
            contentLength: response.headers.get('content-length')
        });

        // Check content type
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('❌ Non-JSON response received!');
            const text = await response.text();
            console.error('Response body:', text.substring(0, 500));
            throw new Error('Server returned invalid response (not JSON)');
        }

        // Parse response
        console.log('→ Parsing JSON response...');
        const data = await response.json();
        console.log('→ Parsed data:', data);

        // Check if response is OK
        if (!response.ok) {
            console.error('❌ HTTP error:', response.status);
            console.error('Error data:', data);
            throw new Error(data.message || `Server error (${response.status})`);
        }

        // Check if success
        if (!data.success) {
            console.error('❌ API returned success: false');
            throw new Error(data.message || 'Processing failed');
        }

        // Check if result exists
        if (!data.result) {
            console.error('❌ No result URL in response');
            throw new Error('No result from API');
        }

        // Validate result URL
        if (!data.result.startsWith('http')) {
            console.error('❌ Invalid result URL:', data.result);
            throw new Error('Invalid result URL from API');
        }

        console.log('✓ All validations passed!');
        return data;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('❌ Request timeout after 2 minutes');
            throw new Error('Processing took too long (>2 min). Try a smaller image.');
        }
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            console.error('❌ Network error - cannot reach server');
            throw new Error('Cannot connect to server. Check your internet connection.');
        }
        
        console.error('❌ Unexpected error:', error);
        throw error;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            console.log('✓ FileReader completed');
            resolve(reader.result);
        };
        reader.onerror = (error) => {
            console.error('❌ FileReader error:', error);
            reject(new Error('Failed to read file: ' + error.message));
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
        } else if (seconds <= 90) {
            loadingText.textContent = `Taking longer... ${seconds}s. Please wait...`;
        } else {
            loadingText.textContent = `This is taking unusually long (${seconds}s). Check console for errors.`;
        }
    }, 1000);
}

function stopProgressTimer() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

// Native browser download
function handleDownload() {
    if (!resultImageUrl) return;

    try {
        console.log('Starting download...');
        
        const randomName = generateRandomFilename();
        const downloadUrl = `/api/download?url=${encodeURIComponent(resultImageUrl)}&filename=${randomName}`;
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = randomName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        console.log('Download initiated:', randomName);
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to start download. Please try again.');
    }
}

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
