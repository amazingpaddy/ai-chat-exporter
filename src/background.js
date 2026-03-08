/**
 * AI Chat Exporter - Background Service Worker
 * Handles image capture via offscreen document and getDisplayMedia
 * Version 4.1.0
 */

let captureSessionActive = false;
let offscreenDocumentCreated = false;

console.log('[AI Chat Exporter] Background service worker loaded');

// Listen for messages from content scripts and offscreen document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Received message:', request.action, request.url?.substring(0, 80) || '');
  
  switch (request.action) {
    case 'startCaptureSession':
      startCaptureSession()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'captureImageAsBase64':
      captureImageViaDisplayMedia(request.url)
        .then(result => {
          console.log('[Background] Successfully captured image, base64 length:', result.length);
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          console.error('[Background] Capture error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'stopCaptureSession':
      stopCaptureSession()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'captureEnded':
      // Offscreen document notified us that user stopped sharing
      console.log('[Background] Capture ended by user');
      captureSessionActive = false;
      return false;
      
    default:
      return false;
  }
});

/**
 * Start a capture session by creating offscreen document and initializing capture
 */
async function startCaptureSession() {
  console.log('[Background] Starting capture session...');
  
  // Create offscreen document if not already created
  if (!offscreenDocumentCreated) {
    await createOffscreenDocument();
  }
  
  // Initialize capture in offscreen document
  const response = await chrome.runtime.sendMessage({ action: 'initCapture' });
  
  if (!response.success) {
    throw new Error(response.error || 'Failed to initialize capture');
  }
  
  captureSessionActive = true;
  console.log('[Background] Capture session started');
}

/**
 * Create the offscreen document for display media capture
 */
async function createOffscreenDocument() {
  console.log('[Background] Creating offscreen document...');
  
  // Check if already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  
  if (existingContexts.length > 0) {
    console.log('[Background] Offscreen document already exists');
    offscreenDocumentCreated = true;
    return;
  }
  
  // Create new offscreen document
  await chrome.offscreen.createDocument({
    url: 'src/offscreen.html',
    reasons: ['DISPLAY_MEDIA'],
    justification: 'Capture screen to embed images in chat export'
  });
  
  offscreenDocumentCreated = true;
  console.log('[Background] Offscreen document created');
}

/**
 * Capture an image by opening it in a tab and capturing the screen
 * @param {string} url - The image URL to capture
 * @returns {Promise<string>} - Base64 data URL
 */
async function captureImageViaDisplayMedia(url) {
  console.log('[Background] Capturing image via display media:', url);
  
  if (!captureSessionActive) {
    throw new Error('Capture session not active');
  }
  
  let tabId = null;
  
  try {
    // Create a new tab with the image URL
    const tab = await chrome.tabs.create({
      url: url,
      active: true  // Make it active so it's visible on screen
    });
    tabId = tab.id;
    console.log('[Background] Created image tab:', tabId);
    
    // Wait for tab to load
    await waitForTabLoad(tabId);
    console.log('[Background] Tab loaded');
    
    // Additional delay to ensure image is fully rendered
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Capture frame from offscreen document
    const response = await chrome.runtime.sendMessage({ action: 'captureFrame' });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to capture frame');
    }
    
    // Close the image tab
    await chrome.tabs.remove(tabId);
    tabId = null;
    console.log('[Background] Closed image tab');
    
    return response.data;
  } catch (error) {
    console.error('[Background] Display media capture failed:', error);
    
    // Clean up tab if created
    if (tabId) {
      try {
        await chrome.tabs.remove(tabId);
      } catch (e) {
        // Tab may already be closed
      }
    }
    
    throw error;
  }
}

/**
 * Stop the capture session and clean up
 */
async function stopCaptureSession() {
  console.log('[Background] Stopping capture session...');
  
  if (offscreenDocumentCreated) {
    try {
      // Tell offscreen document to stop capture
      await chrome.runtime.sendMessage({ action: 'stopCapture' });
      
      // Close offscreen document
      await chrome.offscreen.closeDocument();
      offscreenDocumentCreated = false;
    } catch (e) {
      console.warn('[Background] Error closing offscreen document:', e);
    }
  }
  
  captureSessionActive = false;
  console.log('[Background] Capture session stopped');
}

/**
 * Wait for a tab to finish loading
 * @param {number} tabId - The tab ID to wait for
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, 10000);
    
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    
    chrome.tabs.onUpdated.addListener(listener);
    
    // Check if already loaded
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(reject);
  });
}

console.log('[AI Chat Exporter] Background service worker loaded');
