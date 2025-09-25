
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
      // Create dropdown for selection presets, filename, and export mode
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
      dropdown.innerHTML = `
        <div style="margin-top:10px;">
          <label style="margin-right:10px;">
            <input type="radio" name="chatgpt-export-mode" value="file" checked>
            Export as file
          </label>
          <label>
            <input type="radio" name="chatgpt-export-mode" value="clipboard">
            Export to clipboard
          </label>
        </div>
        <div id="chatgpt-filename-row" style="margin-top:10px;display:block;">
          <label for="chatgpt-filename-input" style="font-weight:bold;">Filename <span style='color:#888;font-weight:normal;'>(optional)</span>:</label>
          <input id="chatgpt-filename-input" type="text" style="margin-left:8px;padding:2px 8px;width:260px;" value="">
          <span style="display:block;font-size:0.95em;color:#888;margin-top:2px;">Optional. Leave blank to use chat title or timestamp. Only <b>.md</b> (Markdown) files are supported. Do not include an extension.</span>
        </div>
        <div style="margin-top:14px;">
          <label style="font-weight:bold;">Select messages:</label>
          <select id="chatgpt-select-dropdown" style="margin-left:8px;padding:2px 8px;">
            <option value="all">All</option>
            <option value="ai">Only answers</option>
            <option value="none">None</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      `;
      // Show/hide filename input based on export mode
      function updateFilenameRow() {
        const fileRow = dropdown.querySelector('#chatgpt-filename-row');
        const fileRadio = dropdown.querySelector('input[name="chatgpt-export-mode"][value="file"]');
        if (fileRow && fileRadio) {
          fileRow.style.display = fileRadio.checked ? 'block' : 'none';
        }
      }
      dropdown.querySelectorAll('input[name="chatgpt-export-mode"]').forEach(radio => {
        radio.addEventListener('change', updateFilenameRow);
      });
      updateFilenameRow();
      document.body.appendChild(dropdown);
      // Helper to inject checkboxes if not present (idempotent)
      function ensureCheckboxesInjected() {
        const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"]'));
        turns.forEach((turn) => {
          // User query checkbox
          const userHeading = turn.querySelector('h5.sr-only');
          if (userHeading && !turn.querySelector('.chatgpt-export-checkbox.user')) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'chatgpt-export-checkbox user';
            cb.checked = true;
            cb.title = 'Include this user message in export';
            cb.style.position = 'absolute';
            cb.style.right = '28px';
            cb.style.top = '8px';
            cb.style.zIndex = '10000';
            cb.style.transform = 'scale(1.2)';
            turn.style.position = 'relative';
            turn.appendChild(cb);
          }
          // Model response checkbox
          const modelHeading = turn.querySelector('h6.sr-only');
          if (modelHeading && !turn.querySelector('.chatgpt-export-checkbox.model')) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'chatgpt-export-checkbox model';
            cb.checked = true;
            cb.title = 'Include this ChatGPT response in export';
            cb.style.position = 'absolute';
            cb.style.right = '28px';
            cb.style.top = '36px';
            cb.style.zIndex = '10000';
            cb.style.transform = 'scale(1.2)';
            turn.style.position = 'relative';
            turn.appendChild(cb);
          }
        });
      }
      // Add event listener for selection dropdown
      const selectDropdown = dropdown.querySelector('#chatgpt-select-dropdown');
      window.chatgptLastDropdownSelection = 'all';
      selectDropdown.addEventListener('change', (e) => {
        ensureCheckboxesInjected();
        const val = e.target.value;
        window.chatgptLastDropdownSelection = val;
        window.chatgptApplyDropdownSelection(val);
      });
      // Listen for manual checkbox changes to set dropdown to custom
      document.addEventListener('change', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('chatgpt-export-checkbox')) {
          const select = document.getElementById('chatgpt-select-dropdown');
          if (select && select.value !== 'custom') {
            select.value = 'custom';
            window.chatgptLastDropdownSelection = 'custom';
          }
        }
      });
      // Helper to re-apply dropdown selection to checkboxes
      window.chatgptApplyDropdownSelection = function(val) {
        if (val === 'all') {
          document.querySelectorAll('.chatgpt-export-checkbox').forEach(cb => { cb.checked = true; });
        } else if (val === 'ai') {
          document.querySelectorAll('.chatgpt-export-checkbox.user').forEach(cb => { cb.checked = false; });
          document.querySelectorAll('.chatgpt-export-checkbox.model').forEach(cb => { cb.checked = true; });
        } else if (val === 'none') {
          document.querySelectorAll('.chatgpt-export-checkbox').forEach(cb => { cb.checked = false; });
        }
      }
      btn.addEventListener('click', async () => {
        ensureCheckboxesInjected();
        if (dropdown.style.display === 'none') {
          dropdown.style.display = '';
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Exporting...';
        let exportMode = 'file';
        let filename = '';
        const modeRadio = dropdown.querySelector('input[name="chatgpt-export-mode"]:checked');
        if (modeRadio) {
          exportMode = modeRadio.value;
        }
        if (exportMode === 'file') {
          const filenameInput = dropdown.querySelector('#chatgpt-filename-input');
          if (filenameInput && filenameInput.value) {
            filename = filenameInput.value.trim();
          }
        }
        dropdown.style.display = 'none';
        try {
          await exportHandler(exportMode, filename);
          // After export, reset filename input to empty
          if (exportMode === 'file') {
            const filenameInput = dropdown.querySelector('#chatgpt-filename-input');
            if (filenameInput) {
              filenameInput.value = '';
            }
          }
        } finally {
          btn.disabled = false;
          btn.textContent = buttonText;
        }
      });
      document.addEventListener('mousedown', (e) => {
        if (dropdown.style.display !== 'none' && !dropdown.contains(e.target) && e.target !== btn) {
          dropdown.style.display = 'none';
        }
      });
      document.body.appendChild(btn);
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
async function chatgptExportMain(exportMode = 'file', customFilename = '') {
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
  const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"]'));
  // Inject checkboxes for each user and model message (if not already present)
  turns.forEach((turn) => {
    // User query checkbox
    const userHeading = turn.querySelector('h5.sr-only');
    if (userHeading && !turn.querySelector('.chatgpt-export-checkbox.user')) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'chatgpt-export-checkbox user';
      cb.checked = true;
      cb.title = 'Include this user message in export';
      cb.style.position = 'absolute';
      cb.style.right = '28px';
      cb.style.top = '8px';
      cb.style.zIndex = '10000';
      cb.style.transform = 'scale(1.2)';
      turn.style.position = 'relative';
      turn.appendChild(cb);
    }
    // Model response checkbox
    const modelHeading = turn.querySelector('h6.sr-only');
    if (modelHeading && !turn.querySelector('.chatgpt-export-checkbox.model')) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'chatgpt-export-checkbox model';
      cb.checked = true;
      cb.title = 'Include this ChatGPT response in export';
      cb.style.position = 'absolute';
      cb.style.right = '28px';
      cb.style.top = '36px';
      cb.style.zIndex = '10000';
      cb.style.transform = 'scale(1.2)';
      turn.style.position = 'relative';
      turn.appendChild(cb);
    }
  });
  // Re-apply last dropdown selection if not custom
  try {
    const select = document.getElementById('chatgpt-select-dropdown');
    if (select && typeof window.chatgptLastDropdownSelection !== 'undefined' && window.chatgptLastDropdownSelection !== 'custom') {
      select.value = window.chatgptLastDropdownSelection;
      if (typeof window.chatgptApplyDropdownSelection === 'function') {
        window.chatgptApplyDropdownSelection(window.chatgptLastDropdownSelection);
      }
    }
  } catch (e) {}
  // Check if any checkboxes are checked
  const anyChecked = Array.from(document.querySelectorAll('.chatgpt-export-checkbox')).some(cb => cb.checked);
  if (!anyChecked) {
    alert('Please select at least one message to export using the checkboxes or the dropdown.');
    return;
  }
  // Get conversation title from <title>
  let title = document.title ? document.title.trim() : '';
  let markdown = '';
  // Default filename if no title
  // Use chat title if available, else timestamp, unless user provides filename
  let filename = '';
  if (exportMode === 'file' && typeof customFilename === 'string' && customFilename.trim()) {
    let base = customFilename.trim().replace(/\.[^/.]+$/, '');
    base = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!base) base = `chatgpt_chat_export_${(function getDateString() { const d = new Date(); const pad = n => n.toString().padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; })()}`;
    filename = `${base}.md`;
  } else {
    let title = document.title ? document.title.trim() : '';
    if (title) {
      let safeTitle = title.replace(/[\\/:*?"<>|.]/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
      filename = safeTitle ? `${safeTitle}_${(function getDateString() { const d = new Date(); const pad = n => n.toString().padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; })()}.md` : `chatgpt_chat_export_${(function getDateString() { const d = new Date(); const pad = n => n.toString().padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; })()}.md`;
    } else {
      filename = `chatgpt_chat_export_${(function getDateString() { const d = new Date(); const pad = n => n.toString().padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; })()}.md`;
    }
  }
  if (title) {
    markdown += `# ${title}\n\n`;
  } else {
    markdown += `# ChatGPT Chat Export\n\n`;
  }
  markdown += `> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
  // Build Markdown for each turn, but only include checked messages
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    // Show a disappearing popup log for which turn is being exported
    const logDiv = document.createElement('div');
    logDiv.textContent = `Processing message ${i + 1} of ${turns.length}...`;
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
    // User message
    const userHeading = turn.querySelector('h5.sr-only');
    const userCb = turn.querySelector('.chatgpt-export-checkbox.user');
    if (userHeading && userCb && userCb.checked) {
      const userDiv = userHeading.nextElementSibling;
      if (userDiv) {
        const userQuery = userDiv.textContent.trim();
        if (userQuery) {
          markdown += `## 👤 You\n\n${userQuery}\n\n`;
        } else {
          markdown += '## 👤 You\n\n[Note: Could not copy user query. Please manually copy and paste this query from message ' + (i + 1) + '.]\n\n';
        }
      } else {
        markdown += '## 👤 You\n\n[Note: User query not found.]\n\n';
      }
    }
    // Assistant (model) message
    const modelHeading = turn.querySelector('h6.sr-only');
    const modelCb = turn.querySelector('.chatgpt-export-checkbox.model');
    if (modelHeading && modelCb && modelCb.checked) {
      const modelDiv = modelHeading.nextElementSibling;
      if (modelDiv) {
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
              markdown += `## 🤖 ChatGPT\n\n${clipboardText}\n\n`;
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
    }
    markdown += '---\n\n';
  }
  if (exportMode === 'clipboard') {
    try {
      await navigator.clipboard.writeText(markdown);
      alert('Conversation copied to clipboard!');
      // Hide checkboxes and reset dropdown after export
      document.querySelectorAll('.chatgpt-export-checkbox').forEach(cb => cb.remove());
      const select = document.getElementById('chatgpt-select-dropdown');
      if (select) {
        select.value = 'all';
        window.chatgptLastDropdownSelection = 'all';
      }
    } catch (e) {
      alert('Failed to copy conversation to clipboard.');
    }
  } else {
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
    // Hide checkboxes and reset dropdown after export
    document.querySelectorAll('.chatgpt-export-checkbox').forEach(cb => cb.remove());
    const select = document.getElementById('chatgpt-select-dropdown');
    if (select) {
      select.value = 'all';
      window.chatgptLastDropdownSelection = 'all';
    }
  }
}
