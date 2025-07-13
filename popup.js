document.getElementById('exportBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = 'Exporting...';
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      files: ['content_script.js']
    }, () => {
      status.textContent = 'Complete! Check your downloads.';
    });
  });
});
