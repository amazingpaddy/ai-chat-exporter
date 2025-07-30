
/**
 * ChatGPT Chat Exporter - ChatGPT content script
 * Injects export button and handles export for ChatGPT chat.
 *
 * Features:
 * - Export all messages in a ChatGPT chat conversation to Markdown.
 * - Option to hide the export button via extension popup.
 * - Uses conversation title for Markdown heading and filename (sanitized).
 * - Robust scroll-to-load and clipboard copy logic.
 */


/**
 * Injects the export button and manages its visibility based on user settings.
 * @param {Object} options
 * @param {string} options.id - Button element ID
 * @param {string} options.buttonText - Button label
 * @param {Object} options.position - CSS position {top, right}
 * @param {Function} options.exportHandler - Export handler function
 */
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
      // Create dropdown for message number input
      const dropdown = document.createElement('div');
      dropdown.style.position = 'fixed';
      dropdown.style.top = (parseInt(position.top) + 44) + 'px';
      dropdown.style.right = position.right;
      dropdown.style.zIndex = '9999';
      dropdown.style.border = '1px solid #ccc';
      dropdown.style.borderRadius = '6px';
      dropdown.style.padding = '10px';
      dropdown.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      dropdown.style.display = 'none';
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        dropdown.style.background = '#222';
        dropdown.style.color = '#fff';
      } else {
        dropdown.style.background = '#fff';
        dropdown.style.color = '#222';
      }
  dropdown.innerHTML = `<label style="font-size:1em;font-weight:bold;" title="A message is a pair of your question and ChatGPT's response. Export will start from the selected message number.">Export from message number:</label><input id="chatgpt-msg-input" type="number" min="1" value="1" style="width:60px;margin-left:8px;" title="Enter the message number you want to start exporting from. Each message is a question and its response.">`;
      document.body.appendChild(dropdown);
      btn.addEventListener('click', async () => {
        if (dropdown.style.display === 'none') {
          dropdown.style.display = '';
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Exporting...';
        let startMsg = 1;
        const input = document.getElementById('chatgpt-msg-input');
        if (input && input.value) {
          startMsg = Math.max(1, parseInt(input.value));
        }
        dropdown.style.display = 'none';
        try {
          await exportHandler(startMsg);
        } finally {
          btn.disabled = false;
          btn.textContent = buttonText;
        }
      });
      // Only show dropdown on button click, not hover
      // Hide dropdown when clicking outside or after export
      document.addEventListener('mousedown', (e) => {
        if (dropdown.style.display !== 'none' && !dropdown.contains(e.target) && e.target !== btn) {
          dropdown.style.display = 'none';
        }
      });
      document.body.appendChild(btn);
    } else {
      btn.style.display = '';
    }
  }
  /**
   * Checks chrome.storage for hideExportBtn and updates button visibility.
   */
  function updateBtnFromStorage() {
    try {
      if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['hideExportBtn'], (result) => {
          ensureBtn(!result.hideExportBtn);
        });
      }
    } catch (e) {
      // Silently ignore extension context errors
    }
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

/**
 * Main export logic for ChatGPT chat.
 * - Scrolls to load all messages.
 * - Extracts user and model messages.
 * - Uses conversation title for heading and filename (sanitized).
 * - Downloads Markdown file.
 */
async function chatgptExportMain(startMsg = 1) {
  /**
   * Sleep helper for async delays.
   * @param {number} ms
   */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  // No citation remover needed for ChatGPT
  // Step 1: Scroll to load full chat history (robust for long chats)
  // Find the chat history scroll container
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
  // Scroll to load all chat turns (handles long conversations)
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
  // Extract all conversation turns
  const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"]'));
  // Get conversation title from <title>
  let title = document.title ? document.title.trim() : '';
  let markdown = '';
  // Default filename if no title
  let filename = 'chatgpt_chat_export.md';
  // Get current timestamp for filename
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  if (title) {
    markdown += `# ${title}\n\n`;
    // Sanitize title for filename: replace spaces with _, remove periods and forbidden chars
    let safeTitle = title
      .replace(/[\\/:*?"<>|.]/g, '') // forbidden chars and periods
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, ''); // trim leading/trailing underscores
    if (safeTitle.length > 0) {
      filename = `${safeTitle}_${timestamp}.md`;
    } else {
      filename = `chatgpt_chat_export_${timestamp}.md`;
    }
  } else {
    markdown += `# ChatGPT Chat Export\n\n`;
    filename = `chatgpt_chat_export_${timestamp}.md`;
  }
  markdown += `> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
  // Build Markdown for each turn
  for (let i = startMsg - 1; i < turns.length; i++) {
    const turn = turns[i];
    // Show a disappearing popup log for which turn is being exported
    const logDiv = document.createElement('div');
    logDiv.textContent = `Exporting message ${i + 1} of ${turns.length}...`;
    logDiv.style.position = 'fixed';
    logDiv.style.top = '20px';
    logDiv.style.right = '20px';
    logDiv.style.background = '#333';
    logDiv.style.color = '#fff';
    logDiv.style.padding = '8px 16px';
    logDiv.style.borderRadius = '6px';
    logDiv.style.zIndex = '99999';
    logDiv.style.fontSize = '1em';
    logDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    document.body.appendChild(logDiv);
    setTimeout(() => { document.body.removeChild(logDiv); }, 1200);

    markdown += `### Message ${i + 1}\n\n`;
    // User message
    let userQuery = '';
    const userHeading = turn.querySelector('h5.sr-only');
    let userQuerySuccess = false;
    if (userHeading && userHeading.textContent.trim().toLowerCase().includes('you said')) {
      const userDiv = userHeading.nextElementSibling;
      if (userDiv) {
        userQuery = userDiv.textContent.trim();
        if (userQuery) {
          markdown += `## 👤 You\n\n${userQuery}\n\n`;
          userQuerySuccess = true;
        } else {
          markdown += '## 👤 You\n\n[Note: Could not copy user query. Please manually copy and paste this query from message ' + (i + 1) + '.]\n\n';
        }
      } else {
        markdown += '## 👤 You\n\n[Note: User query not found.]\n\n';
      }
    } else {
      markdown += '## 👤 You\n\n[Note: User query not found.]\n\n';
    }
    // Assistant (model) message
    let modelResponse = '';
    const modelHeading = turn.querySelector('h6.sr-only');
    let modelResponseSuccess = false;
    if (modelHeading && modelHeading.textContent.trim().toLowerCase().includes('chatgpt said')) {
      const modelDiv = modelHeading.nextElementSibling;
      if (modelDiv) {
        // Find and click the copy button for this turn
        const copyBtn = turn.querySelector('button[data-testid="copy-turn-action-button"]');
        if (copyBtn) {
          try { await navigator.clipboard.writeText(''); } catch (e) {}
          let attempts = 0;
          let clipboardText = '';
          while (attempts < 10) {
            copyBtn.click();
            await sleep(300);
            clipboardText = await navigator.clipboard.readText();
            if (clipboardText) break;
            attempts++;
          }
          if (!clipboardText) {
            markdown += '## 🤖 ChatGPT\n\n[Note: Could not copy model response. Please manually copy and paste this response from message ' + (i + 1) + '.]\n\n';
          } else {
            try {
              modelResponse = clipboardText;
              markdown += `## 🤖 ChatGPT\n\n${modelResponse}\n\n`;
              modelResponseSuccess = true;
            } catch (e) {
              markdown += '## 🤖 ChatGPT\n\n[Note: Could not read clipboard. Please check permissions.]\n\n';
            }
          }
        } else {
          markdown += '## 🤖 ChatGPT\n\n[Note: Copy button not found. Please check the chat UI.]\n\n';
        }
      } else {
        markdown += '## 🤖 ChatGPT\n\n[Note: Model response not found.]\n\n';
      }
    } else {
      markdown += '## 🤖 ChatGPT\n\n[Note: Model response not found.]\n\n';
    }
    markdown += '---\n\n';
  }
  // Download as Markdown file
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
