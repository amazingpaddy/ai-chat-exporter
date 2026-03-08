/**
 * AI Chat Exporter - Background Service Worker
 * Handles cross-origin image fetching to bypass CORS restrictions
 * Version 4.1.0
 */

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchImageAsBase64') {
    fetchImageAsBase64(request.url)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
});

/**
 * Fetch an image URL and convert it to base64 data URL
 * Background scripts can bypass CORS restrictions
 * @param {string} url - The image URL to fetch
 * @returns {Promise<string>} - Base64 data URL
 */
async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    
    // Verify it's an image
    if (!blob.type.startsWith('image/')) {
      throw new Error(`Not an image: ${blob.type}`);
    }
    
    // Convert blob to base64 data URL
    return await blobToBase64(blob);
  } catch (error) {
    console.error('[Background] Failed to fetch image:', url, error);
    throw error;
  }
}

/**
 * Convert a Blob to a base64 data URL
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} - Base64 data URL
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

console.log('[AI Chat Exporter] Background service worker loaded');
