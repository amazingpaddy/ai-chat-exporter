/**
 * popup.js
 * Handles the extension popup UI for hiding/showing the export button.
 *
 * Features:
 * - Checkbox to hide/show export button on supported chat pages.
 * - Persists user choice using chrome.storage.sync.
 */

// Get the checkbox element
const hideExportBtnCheckbox = document.getElementById('hideExportBtn');

// Load saved state from chrome.storage and update checkbox
chrome.storage.sync.get(['hideExportBtn'], (result) => {
  hideExportBtnCheckbox.checked = !!result.hideExportBtn;
});

// Save state when checkbox is toggled
hideExportBtnCheckbox.addEventListener('change', (e) => {
  chrome.storage.sync.set({ hideExportBtn: hideExportBtnCheckbox.checked });
});
