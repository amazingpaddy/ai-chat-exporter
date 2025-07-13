// Gemini Chat Exporter - Gemini content script
// Injects export button and handles export for Gemini chat

function addExportButton({ id, buttonText, position, exportHandler }) {
  function ensureBtn() {
    let btn = document.getElementById(id);
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
    }
  }
  ensureBtn();
  const observer = new MutationObserver(() => ensureBtn());
  observer.observe(document.body, { childList: true, subtree: true });
}

addExportButton({
  id: 'gemini-export-btn',
  buttonText: 'Export Chat',
  position: { top: '80px', right: '20px' },
  exportHandler: geminiExportMain
});

async function geminiExportMain() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function removeCitations(text) {
    return text
      .replace(/\[cite_start\]/g, '')
      .replace(/\[cite:[\d,\s]+\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  const scrollContainer = document.querySelector('[data-test-id="chat-history-container"]');
  if (!scrollContainer) {
    alert('Could not find chat history container. Are you on a Gemini chat page?');
    return;
  }
  let stableScrolls = 0;
  const maxStableScrolls = 4;
  const maxScrollAttempts = 60;
  let scrollAttempts = 0;
  let lastScrollTop = null;
  while (stableScrolls < maxStableScrolls && scrollAttempts < maxScrollAttempts) {
    const turns = document.querySelectorAll('div.conversation-container');
    const currentTurnCount = turns.length;
    scrollContainer.scrollTop = 0;
    await sleep(2000);
    const scrollTop = scrollContainer.scrollTop;
    const newTurnCount = document.querySelectorAll('div.conversation-container').length;
    if (newTurnCount === currentTurnCount && (lastScrollTop === scrollTop || scrollTop === 0)) {
      stableScrolls++;
    } else {
      stableScrolls = 0;
    }
    lastScrollTop = scrollTop;
    scrollAttempts++;
  }
  const turns = Array.from(document.querySelectorAll('div.conversation-container'));
  let markdown = `# Gemini Chat Export\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    let userQuery = '';
    const userQueryElem = turn.querySelector('user-query');
    if (userQueryElem) {
      userQuery = userQueryElem.textContent.trim();
      markdown += `## 👤 You\n\n${userQuery}\n\n`;
    }
    let modelResponse = '';
    const modelRespElem = turn.querySelector('model-response');
    if (modelRespElem) {
      modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(500);
      const copyBtn = turn.querySelector('button[data-test-id="copy-button"]');
      if (copyBtn) {
        copyBtn.click();
        await sleep(500);
        try {
          modelResponse = await navigator.clipboard.readText();
          modelResponse = removeCitations(modelResponse);
          markdown += `## 🤖 Gemini\n\n${modelResponse}\n\n`;
        } catch (e) {
          markdown += '## 🤖 Gemini\n\n[Note: Could not read clipboard. Please check permissions.]\n\n';
        }
      } else {
        markdown += '## 🤖 Gemini\n\n[Note: Copy button not found. Please check the chat UI.]\n\n';
      }
    } else {
      markdown += '## 🤖 Gemini\n\n[Note: Model response not found.]\n\n';
    }
    markdown += '---\n\n';
  }
  // Download as Markdown file
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gemini_chat_export.md';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
