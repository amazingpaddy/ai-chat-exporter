
/**
 * Gemini Chat Exporter - Gemini content script
 * Injects export button and handles export for Gemini chat.
 *
 * Features:
 * - Export all messages in a Gemini chat conversation to Markdown.
 * - Option to hide the export button via extension popup.
 * - Robust scroll-to-load and clipboard copy logic.
 * - Removes Gemini citation markers from exported content.
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
      // Create dropdown for turn number input
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
  dropdown.innerHTML = `<label style="font-size:1em;font-weight:bold;" title="A message is a pair of your question and Gemini's response. Export will start from the selected message number.">Export from message number:</label><input id="gemini-turn-input" type="number" min="1" value="1" style="width:60px;margin-left:8px;" title="Enter the message number you want to start exporting from. Each message is a question and its response.">`;
      document.body.appendChild(dropdown);
      btn.addEventListener('click', async () => {
        if (dropdown.style.display === 'none') {
          dropdown.style.display = '';
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Exporting...';
        let startTurn = 1;
        const input = document.getElementById('gemini-turn-input');
        if (input && input.value) {
          startTurn = Math.max(1, parseInt(input.value));
        }
        dropdown.style.display = 'none';
        try {
          await exportHandler(startTurn);
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
  id: 'gemini-export-btn',
  buttonText: 'Export Chat',
  position: { top: '80px', right: '20px' },
  exportHandler: geminiExportMain
});

/**
 * Main export logic for Gemini chat.
 * - Scrolls to load all messages.
 * - Extracts user and model messages directly from the DOM.
 * - Stores conversation in an in-memory array.
 * - Formats the output with "Prompt" and "Response" headings.
 * - Downloads Markdown file.
 */
async function geminiExportMain(startTurn = 1) {
  /**
   * Sleep helper for async delays.
   * @param {number} ms
   */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * Removes Gemini citation markers from text.
   * @param {string} text
   * @returns {string}
   */
  function removeCitations(text) {
    return text
      .replace(/\[cite_start\]/g, '')
      .replace(/\[cite:[\d,\s]+\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Find the chat history scroll container
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

  // Scroll to load all chat turns (handles long conversations)
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

  // Extract all conversation turns
  const turns = Array.from(document.querySelectorAll('div.conversation-container'));
  let conversationData = [];

  // Build conversation data for each turn
  for (let i = startTurn - 1; i < turns.length; i++) {
    const turn = turns[i];
    const popup = document.createElement('div');
    popup.textContent = `Exporting message ${i + 1} of ${turns.length}...`;
    popup.style.position = 'fixed';
    popup.style.top = '24px';
    popup.style.right = '24px';
    popup.style.zIndex = '99999';
    popup.style.background = '#333';
    popup.style.color = '#fff';
    popup.style.padding = '10px 18px';
    popup.style.borderRadius = '8px';
    popup.style.fontSize = '1em';
    popup.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
    popup.style.opacity = '0.95';
    popup.style.pointerEvents = 'none';
    document.body.appendChild(popup);
    setTimeout(() => { popup.remove(); }, 900);

    const userQueryElem = turn.querySelector('user-query');
    const userQuery = userQueryElem ? userQueryElem.textContent.trim() : '[Note: Could not extract prompt.]';

    const modelRespElem = turn.querySelector('model-response');
    let modelResponse = '[Note: Could not extract response.]';
    if (modelRespElem) {
      const responseContent = modelRespElem.querySelector('.response-content-container');
      if (responseContent) {
        modelResponse = removeCitations(responseContent.textContent);
      }
    }

    conversationData.push({ prompt: userQuery, response: modelResponse });
  }

  // Build the final Markdown string
  let markdown = `# Gemini Chat Export\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
  conversationData.forEach(turn => {
    markdown += `## Prompt:\n\n${turn.prompt}\n\n## Response:\n\n${turn.response}\n\n---\n\n`;
  });

  // Build output filename with current date/time in YYYY-MM-DD_HHMMSS format
  function getDateString() {
    const d = new Date();
    const pad = n => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  const filename = `gemini_chat_export_${getDateString()}.md`;

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
