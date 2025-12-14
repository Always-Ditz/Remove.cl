const express = require('express');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('.')); // Serve static files from root

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Combined Upload + Process endpoint
app.post('/api/process', async (req, res) => {
  try {
    const { image, filename, mimetype } = req.body;

    if (!image) {
      return res.status(400).json({ 
        success: false, 
        message: 'No image data provided' 
      });
    }

    console.log('Step 1: Uploading to Catbox...');
    const startTime = Date.now();

    // Convert base64 to buffer
    const buffer = Buffer.from(image, 'base64');

    // Upload to Catbox.moe
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', buffer, {
      filename: filename || 'image.png',
      contentType: mimetype || 'image/png'
    });
    
    const uploadResponse = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Catbox upload error:', errorText);
      throw new Error('Failed to upload image to hosting');
    }

    const imageUrl = await uploadResponse.text();
    const uploadTime = Date.now() - startTime;
    console.log(`✓ Upload complete in ${uploadTime}ms:`, imageUrl);
    
    if (!imageUrl || !imageUrl.startsWith('https://')) {
      throw new Error('Invalid URL from image hosting');
    }

    // Step 2: Process with Nekolabs API (NO TIMEOUT LIMIT on Railway!)
    console.log('Step 2: Processing with Nekolabs API...');
    const processStartTime = Date.now();
    
    const apiUrl = `https://api.nekolabs.web.id/style-changer/remove-clothes?imageUrl=${encodeURIComponent(imageUrl.trim())}`;
    
    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Connection': 'keep-alive'
      }
    });

    const processTime = Date.now() - processStartTime;
    console.log(`✓ API responded in ${processTime}ms`);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('API error response:', errorText);
      
      // Handle specific error codes
      if (apiResponse.status === 400) {
        throw new Error('Invalid image format or unsupported image type');
      } else if (apiResponse.status === 404) {
        throw new Error('Image not found. The uploaded URL may have expired');
      } else if (apiResponse.status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again');
      } else if (apiResponse.status >= 500) {
        throw new Error('API server error. Please try again in a few minutes');
      }
      
      throw new Error(`API error (status ${apiResponse.status})`);
    }

    // Parse JSON response
    const contentType = apiResponse.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await apiResponse.text();
      console.error('Non-JSON response:', text.substring(0, 200));
      throw new Error('API returned invalid response format');
    }

    const data = await apiResponse.json();
    
    // Validate response
    if (!data.success) {
      throw new Error(data.message || 'API processing failed');
    }

    if (!data.result || !data.result.startsWith('http')) {
      throw new Error('Invalid result from API');
    }

    const totalTime = Date.now() - startTime;
    console.log(`✓ Complete! Total time: ${totalTime}ms`);

    res.json({
      success: true,
      result: data.result,
      uploadedUrl: imageUrl.trim(),
      timestamp: data.timestamp || new Date().toISOString(),
      timing: {
        upload: `${uploadTime}ms`,
        processing: data.responseTime || `${processTime}ms`,
        total: `${totalTime}ms`
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Map errors to appropriate HTTP status codes
    let statusCode = 500;
    let errorMessage = error.message || 'Failed to process image';
    
    if (error.message.includes('Invalid') || error.message.includes('unsupported')) {
      statusCode = 400;
    } else if (error.message.includes('not found') || error.message.includes('expired')) {
      statusCode = 404;
    } else if (error.message.includes('Too many')) {
      statusCode = 429;
    } else if (error.message.includes('reach') || error.message.includes('unreachable')) {
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    const customFilename = req.query.filename;

    if (!imageUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Image URL is required' 
      });
    }

    console.log('Downloading image:', imageUrl);

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const imageBuffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    console.log('Image downloaded, size:', imageBuffer.length, 'bytes');

    // Determine file extension
    let extension = 'png';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      extension = 'jpg';
    } else if (contentType.includes('webp')) {
      extension = 'webp';
    } else if (contentType.includes('gif')) {
      extension = 'gif';
    }

    const filename = customFilename || `result_${Date.now()}.${extension}`;

    // Set headers for browser download with progress
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', imageBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    res.send(imageBuffer);

  } catch (error) {
    console.error('Download error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to download image'
      });
    }
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🌐 Railway will assign public URL automatically`);
});