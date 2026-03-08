/**
 * AI Chat Exporter - Background Service Worker
 * Handles image capture via tab screenshot
 * Version 4.1.0
 */

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Received message:', request.action, request.url?.substring(0, 80));
  
  if (request.action === 'captureImageAsBase64') {
    captureImageViaTab(request.url)
      .then(result => {
        console.log('[Background] Successfully captured image, base64 length:', result.length);
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('[Background] Capture error:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send response asynchronously
    return true;
  }
});

/**
 * Capture an image by opening it in a background tab and taking a screenshot
 * This bypasses CORS because we're capturing the visible tab, not fetching cross-origin
 * @param {string} url - The image URL to capture
 * @returns {Promise<string>} - Base64 data URL (PNG format from captureVisibleTab)
 */
async function captureImageViaTab(url) {
  console.log('[Background] Capturing image via tab:', url);
  
  let tabId = null;
  
  try {
    // Create a background tab with the image URL
    const tab = await chrome.tabs.create({
      url: url,
      active: false  // Keep it in background
    });
    tabId = tab.id;
    console.log('[Background] Created tab:', tabId);
    
    // Wait for the tab to finish loading
    await waitForTabLoad(tabId);
    console.log('[Background] Tab loaded');
    
    // Small delay to ensure image is rendered
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get the tab's window ID for captureVisibleTab
    const tabInfo = await chrome.tabs.get(tabId);
    
    // We need to make the tab active briefly to capture it
    // Store the current active tab so we can restore it
    const [currentTab] = await chrome.tabs.query({ active: true, windowId: tabInfo.windowId });
    
    // Activate the image tab
    await chrome.tabs.update(tabId, { active: true });
    
    // Small delay after activation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Capture the visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tabInfo.windowId, {
      format: 'png'
    });
    console.log('[Background] Captured screenshot, length:', dataUrl.length);
    
    // Restore the original active tab
    if (currentTab) {
      await chrome.tabs.update(currentTab.id, { active: true });
    }
    
    // Close the image tab
    await chrome.tabs.remove(tabId);
    console.log('[Background] Closed image tab');
    
    return dataUrl;
  } catch (error) {
    console.error('[Background] Tab capture failed:', error);
    
    // Clean up: close the tab if it was created
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
 * Wait for a tab to finish loading
 * @param {number} tabId - The tab ID to wait for
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timeout'));
    }, 10000); // 10 second timeout
    
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
