/**
 * AI Chat Exporter - Background Service Worker
 * Handles cross-origin image fetching to bypass CORS restrictions
 * Version 4.1.0
 */

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Received message:', request.action, request.url?.substring(0, 80));
  
  if (request.action === 'fetchImageAsBase64') {
    fetchImageAsBase64(request.url)
      .then(result => {
        console.log('[Background] Successfully fetched image, base64 length:', result.length);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('[Background] Fetch error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
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
  console.log('[Background] Fetching:', url);
  
  try {
    // Fetch without credentials - Google's CORS headers use wildcard '*'
    // which doesn't work with credentials: 'include'
    const response = await fetch(url, {
      credentials: 'omit',
      mode: 'cors'
    });
    
    console.log('[Background] Response status:', response.status, response.statusText);
    console.log('[Background] Response type:', response.type);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log('[Background] Got blob:', blob.type, blob.size, 'bytes');
    
    // Verify it's an image (or allow empty type for opaque responses)
    if (blob.type && !blob.type.startsWith('image/')) {
      throw new Error(`Not an image: ${blob.type}`);
    }
    
    // Convert blob to base64 data URL
    const base64 = await blobToBase64(blob);
    console.log('[Background] Converted to base64, length:', base64.length);
    return base64;
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
