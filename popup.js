// popup.js
const hideExportBtnCheckbox = document.getElementById('hideExportBtn');

// Load saved state
chrome.storage.sync.get(['hideExportBtn'], (result) => {
  hideExportBtnCheckbox.checked = !!result.hideExportBtn;
});

hideExportBtnCheckbox.addEventListener('change', (e) => {
  chrome.storage.sync.set({ hideExportBtn: hideExportBtnCheckbox.checked });
});
