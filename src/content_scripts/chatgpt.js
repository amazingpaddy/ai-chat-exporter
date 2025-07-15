// ChatGPT Chat Exporter - ChatGPT content script
// Injects export button and handles export for ChatGPT chat


function addExportButton({ id, buttonText, position, exportHandler }) {
  let observer;
  function ensureBtn(shouldShow) {
    let btn = document.getElementById(id);
    if (!shouldShow) {
      if (btn) btn.style.display = 'none';
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.id = id;
      btn.textContent = buttonText;
      btn.style.position = 'fixed';
      btn.style.top = position.top;
      btn.style.right = position.right;
      btn.style.zIndex = '9999';
      btn.style.padding = '8px 16px';
      btn.style.background = '#1a73e8';
      btn.style.color = '#fff';
      btn.style.border = 'none';
      btn.style.borderRadius = '6px';
      btn.style.fontSize = '1em';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      btn.style.cursor = 'pointer';
      btn.style.fontWeight = 'bold';
      btn.style.transition = 'background 0.2s';
      btn.onmouseenter = () => btn.style.background = '#1765c1';
      btn.onmouseleave = () => btn.style.background = '#1a73e8';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Exporting...';
        try {
          await exportHandler();
        } finally {
          btn.disabled = false;
          btn.textContent = buttonText;
        }
      });
      document.body.appendChild(btn);
    } else {
      btn.style.display = '';
    }
  }
  function updateBtnFromStorage() {
    chrome.storage.sync.get(['hideExportBtn'], (result) => {
      ensureBtn(!result.hideExportBtn);
    });
  }
  updateBtnFromStorage();
  observer = new MutationObserver(() => updateBtnFromStorage());
  observer.observe(document.body, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'hideExportBtn' in changes) {
      updateBtnFromStorage();
    }
  });
}

addExportButton({
  id: 'chatgpt-export-btn',
  buttonText: 'Export Chat',
  position: { top: '80px', right: '20px' },
  exportHandler: chatgptExportMain
});

async function chatgptExportMain() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  // No citation remover needed for ChatGPT
  // Step 1: Scroll to load full chat history (robust for long chats)
  const scrollContainer = document.querySelector('div.flex.h-full.flex-col.overflow-y-auto');
  if (!scrollContainer) {
    alert('Could not find chat history container. Are you on a ChatGPT page?');
    return;
  }
  let stableScrolls = 0;
  const maxStableScrolls = 4;
  const maxScrollAttempts = 60;
  let scrollAttempts = 0;
  let lastScrollTop = null;
  while (stableScrolls < maxStableScrolls && scrollAttempts < maxScrollAttempts) {
    const turns = document.querySelectorAll('article[data-testid^="conversation-turn-"]');
    const currentTurnCount = turns.length;
    scrollContainer.scrollTop = 0;
    await sleep(2000);
    const scrollTop = scrollContainer.scrollTop;
    const newTurnCount = document.querySelectorAll('article[data-testid^="conversation-turn-"]').length;
    if (newTurnCount === currentTurnCount && (lastScrollTop === scrollTop || scrollTop === 0)) {
      stableScrolls++;
    } else {
      stableScrolls = 0;
    }
    lastScrollTop = scrollTop;
    scrollAttempts++;
  }
  // Step 2: Gather all conversation turns and build Markdown
  const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"]'));
  let markdown = `# ChatGPT Chat Export\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    // User message
    let userQuery = '';
    const userHeading = turn.querySelector('h5.sr-only');
    if (userHeading && userHeading.textContent.trim().toLowerCase().includes('you said')) {
      const userDiv = userHeading.nextElementSibling;
      if (userDiv) {
        userQuery = userDiv.textContent.trim();
        markdown += `## 👤 You\n\n${userQuery}\n\n`;
      }
    }
    // Assistant (model) message
    let modelResponse = '';
    const modelHeading = turn.querySelector('h6.sr-only');
    if (modelHeading && modelHeading.textContent.trim().toLowerCase().includes('chatgpt said')) {
      const modelDiv = modelHeading.nextElementSibling;
      if (modelDiv) {
        // Find and click the copy button for this turn
        const copyBtn = turn.querySelector('button[data-testid="copy-turn-action-button"]');
        if (copyBtn) {
          copyBtn.click();
          await sleep(500);
          try {
            modelResponse = await navigator.clipboard.readText();
            markdown += `## 🤖 ChatGPT\n\n${modelResponse}\n\n`;
          } catch (e) {
            markdown += '## 🤖 ChatGPT\n\n[Note: Could not read clipboard. Please check permissions.]\n\n';
          }
        } else {
          markdown += '## 🤖 ChatGPT\n\n[Note: Copy button not found. Please check the chat UI.]\n\n';
        }
      }
    }
    markdown += '---\n\n';
  }
  // Download as Markdown file
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chatgpt_chat_export.md';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
