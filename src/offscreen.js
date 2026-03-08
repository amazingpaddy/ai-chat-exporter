/**
 * AI Chat Exporter - Offscreen Document
 * Handles screen capture via getDisplayMedia
 * Version 4.1.0
 */

let mediaStream = null;
let videoElement = null;
let canvas = null;
let ctx = null;

console.log('[Offscreen] Offscreen document loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', request.action);
  
  switch (request.action) {
    case 'initCapture':
      initCapture()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'captureFrame':
      captureFrame()
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'stopCapture':
      stopCapture();
      sendResponse({ success: true });
      return false;
      
    default:
      return false;
  }
});

/**
 * Initialize screen capture by requesting getDisplayMedia
 * User will be prompted to select a screen/window/tab to share
 */
async function initCapture() {
  console.log('[Offscreen] Initializing capture...');
  
  try {
    // Request display media - user will see a picker dialog
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: 'browser',  // Prefer browser tab
        cursor: 'never'              // Don't capture cursor
      },
      audio: false
    });
    
    console.log('[Offscreen] Got media stream');
    
    // Create video element to hold the stream
    videoElement = document.createElement('video');
    videoElement.srcObject = mediaStream;
    videoElement.muted = true;
    
    // Wait for video to be ready
    await new Promise((resolve, reject) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play()
          .then(resolve)
          .catch(reject);
      };
      videoElement.onerror = reject;
    });
    
    console.log('[Offscreen] Video ready:', videoElement.videoWidth, 'x', videoElement.videoHeight);
    
    // Create canvas for frame capture
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    
    // Listen for stream ending (user stops sharing)
    mediaStream.getVideoTracks()[0].onended = () => {
      console.log('[Offscreen] Stream ended by user');
      stopCapture();
      // Notify background script
      chrome.runtime.sendMessage({ action: 'captureEnded' });
    };
    
    console.log('[Offscreen] Capture initialized successfully');
  } catch (error) {
    console.error('[Offscreen] Failed to initialize capture:', error);
    throw error;
  }
}

/**
 * Capture the current frame from the video stream
 * @returns {Promise<string>} Base64 data URL of the captured frame
 */
async function captureFrame() {
  if (!mediaStream || !videoElement || !canvas || !ctx) {
    throw new Error('Capture not initialized');
  }
  
  // Check if stream is still active
  const track = mediaStream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') {
    throw new Error('Stream is not active');
  }
  
  // Set canvas size to match video
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  
  // Draw current frame to canvas
  ctx.drawImage(videoElement, 0, 0);
  
  // Convert to base64
  const dataUrl = canvas.toDataURL('image/png');
  console.log('[Offscreen] Captured frame:', canvas.width, 'x', canvas.height, '- base64 length:', dataUrl.length);
  
  return dataUrl;
}

/**
 * Stop the capture and clean up resources
 */
function stopCapture() {
  console.log('[Offscreen] Stopping capture...');
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  if (videoElement) {
    videoElement.srcObject = null;
    videoElement = null;
  }
  
  canvas = null;
  ctx = null;
  
  console.log('[Offscreen] Capture stopped');
}
