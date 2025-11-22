  // Add selection toggles above chat if not already present
  const chatHeaderId = 'gemini-export-selection-toggles';
  if (!document.getElementById(chatHeaderId)) {
    const scrollContainer = document.querySelector('[data-test-id="chat-history-container"]');
    if (scrollContainer) {
      const togglesDiv = document.createElement('div');
      togglesDiv.id = chatHeaderId;
      togglesDiv.style.display = 'flex';
      togglesDiv.style.gap = '12px';
      togglesDiv.style.alignItems = 'center';
      togglesDiv.style.margin = '12px 0 8px 0';
      togglesDiv.style.padding = '8px 0 8px 8px';
      togglesDiv.style.background = 'var(--toggles-bg, #f5f5f5)';
      togglesDiv.style.borderRadius = '8px';
      togglesDiv.style.fontSize = '1em';
      togglesDiv.style.zIndex = '9999';
      togglesDiv.innerHTML = `
        <button id="gemini-select-all" style="padding:4px 10px;">Select all</button>
        <button id="gemini-deselect-all" style="padding:4px 10px;">Deselect all</button>
        <button id="gemini-select-ai" style="padding:4px 10px;">AI responses only</button>
        <span style="margin-left:12px;color:#888;font-size:0.95em;">(Use checkboxes to customize export)</span>
      `;
      scrollContainer.parentElement.insertBefore(togglesDiv, scrollContainer);
      // Add event listeners
      togglesDiv.querySelector('#gemini-select-all').onclick = () => {
        document.querySelectorAll('.gemini-export-checkbox').forEach(cb => { cb.checked = true; });
      };
      togglesDiv.querySelector('#gemini-deselect-all').onclick = () => {
        document.querySelectorAll('.gemini-export-checkbox').forEach(cb => { cb.checked = false; });
      };
      togglesDiv.querySelector('#gemini-select-ai').onclick = () => {
        document.querySelectorAll('user-query .gemini-export-checkbox').forEach(cb => { cb.checked = false; });
        document.querySelectorAll('model-response .gemini-export-checkbox').forEach(cb => { cb.checked = true; });
      };
    }
  }

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
      // Create dropdown for turn number input and selection options
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
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      dropdown.innerHTML = `
        <div style="margin-top:10px;">
          <label style="margin-right:10px;">
            <input type="radio" name="gemini-export-mode" value="file" checked>
            Export as file
          </label>
          <label>
            <input type="radio" name="gemini-export-mode" value="clipboard">
            Export to clipboard
          </label>
        </div>
        <div id="gemini-filename-row" style="margin-top:10px;display:block;">
          <label for="gemini-filename-input" style="font-weight:bold;">Filename <span style='color:#888;font-weight:normal;'>(optional)</span>:</label>
          <input id="gemini-filename-input" type="text" style="margin-left:8px;padding:2px 8px;width:260px;${isDark ? 'background:#111;color:#fff;border:1px solid #444;' : 'background:#fff;color:#222;border:1px solid #ccc;'}" value="">
          <span style="display:block;font-size:0.95em;color:#888;margin-top:2px;">Optional. Leave blank to use chat title or timestamp. Only <b>.md</b> (Markdown) files are supported. Do not include an extension.</span>
        </div>
        <div style="margin-top:14px;">
          <label style="font-weight:bold;">Select messages:</label>
          <select id="gemini-select-dropdown" style="margin-left:8px;padding:2px 8px;${isDark ? 'background:#111;color:#fff;border:1px solid #444;' : 'background:#fff;color:#222;border:1px solid #ccc;'}">
            <option value="all">All</option>
            <option value="ai">Only answers</option>
            <option value="none">None</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      `;
      // Show/hide filename input based on export mode
      function updateFilenameRow() {
        const fileRow = dropdown.querySelector('#gemini-filename-row');
        const fileRadio = dropdown.querySelector('input[name="gemini-export-mode"][value="file"]');
        if (fileRow && fileRadio) {
          fileRow.style.display = fileRadio.checked ? 'block' : 'none';
        }
      }
      dropdown.querySelectorAll('input[name="gemini-export-mode"]').forEach(radio => {
        radio.addEventListener('change', updateFilenameRow);
      });
      updateFilenameRow();
      document.body.appendChild(dropdown);
            // Helper to inject checkboxes if not present (idempotent)
            function ensureCheckboxesInjected() {
              const turns = Array.from(document.querySelectorAll('div.conversation-container'));
              turns.forEach((turn) => {
                // User query checkbox
                const userQueryElem = turn.querySelector('user-query');
                if (userQueryElem && !userQueryElem.querySelector('.gemini-export-checkbox')) {
                  const cb = document.createElement('input');
                  cb.type = 'checkbox';
                  cb.className = 'gemini-export-checkbox';
                  cb.checked = true;
                  cb.title = 'Include this user message in export';
                  cb.style.position = 'absolute';
                  cb.style.right = '28px';
                  cb.style.top = '8px';
                  cb.style.zIndex = '10000';
                  cb.style.transform = 'scale(1.2)';
                  userQueryElem.style.position = 'relative';
                  userQueryElem.appendChild(cb);
                }
                // Model response checkbox
                const modelRespElem = turn.querySelector('model-response');
                if (modelRespElem && !modelRespElem.querySelector('.gemini-export-checkbox')) {
                  const cb = document.createElement('input');
                  cb.type = 'checkbox';
                  cb.className = 'gemini-export-checkbox';
                  cb.checked = true;
                  cb.title = 'Include this Gemini response in export';
                  cb.style.position = 'absolute';
                  cb.style.right = '28px';
                  cb.style.top = '8px';
                  cb.style.zIndex = '10000';
                  cb.style.transform = 'scale(1.2)';
                  modelRespElem.style.position = 'relative';
                  modelRespElem.appendChild(cb);
                }
              });
            }
      // Add event listener for selection dropdown
      const selectDropdown = dropdown.querySelector('#gemini-select-dropdown');
  // Track last dropdown selection (global for export logic)
  window.lastDropdownSelection = 'all';
      selectDropdown.addEventListener('change', (e) => {
        ensureCheckboxesInjected();
        const val = e.target.value;
        window.lastDropdownSelection = val;
        window.applyDropdownSelection(val);
        // If user selects a preset, don't set to custom
      });
      // Listen for manual checkbox changes to set dropdown to custom
      document.addEventListener('change', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('gemini-export-checkbox')) {
          // Only set to custom if not already set by dropdown
          const select = document.getElementById('gemini-select-dropdown');
          if (select && select.value !== 'custom') {
            select.value = 'custom';
            window.lastDropdownSelection = 'custom';
          }
        }
      });
      // Helper to re-apply dropdown selection to checkboxes
      window.applyDropdownSelection = function(val) {
        if (val === 'all') {
          document.querySelectorAll('.gemini-export-checkbox').forEach(cb => { cb.checked = true; });
        } else if (val === 'ai') {
          document.querySelectorAll('user-query .gemini-export-checkbox').forEach(cb => { cb.checked = false; });
          document.querySelectorAll('model-response .gemini-export-checkbox').forEach(cb => { cb.checked = true; });
        } else if (val === 'none') {
          document.querySelectorAll('.gemini-export-checkbox').forEach(cb => { cb.checked = false; });
        }
      }
      // Listen for manual checkbox changes to set dropdown to custom
      document.addEventListener('change', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('gemini-export-checkbox')) {
          // Only set to custom if not already set by dropdown
          const select = document.getElementById('gemini-select-dropdown');
          if (select && select.value !== 'custom') {
            select.value = 'custom';
          }
        }
      });
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
        const modeRadio = dropdown.querySelector('input[name="gemini-export-mode"]:checked');
        if (modeRadio) {
          exportMode = modeRadio.value;
        }
        if (exportMode === 'file') {
          const filenameInput = dropdown.querySelector('#gemini-filename-input');
          if (filenameInput && filenameInput.value) {
            filename = filenameInput.value.trim();
          }
        }
        dropdown.style.display = 'none';
        try {
          await exportHandler(1, exportMode, filename);
          // After export, reset filename input to empty
          if (exportMode === 'file') {
            const filenameInput = dropdown.querySelector('#gemini-filename-input');
            if (filenameInput) {
              filenameInput.value = '';
            }
          }
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
 * - Extracts user and model messages.
 * - Removes citation markers.
 * - Downloads Markdown file.
 */
async function geminiExportMain(startTurn = 1, exportMode = 'file', customFilename = '') {
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
  // Inject checkboxes for each user and AI message (if not already present)
  turns.forEach((turn, idx) => {
    // User query checkbox
    const userQueryElem = turn.querySelector('user-query');
    if (userQueryElem && !userQueryElem.querySelector('.gemini-export-checkbox')) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'gemini-export-checkbox';
      cb.checked = true;
      cb.title = 'Include this user message in export';
      cb.style.position = 'absolute';
      cb.style.right = '28px';
      cb.style.top = '8px';
      cb.style.zIndex = '10000';
      cb.style.transform = 'scale(1.2)';
      userQueryElem.style.position = 'relative';
      userQueryElem.appendChild(cb);
    }
    // Model response checkbox
    const modelRespElem = turn.querySelector('model-response');
    if (modelRespElem && !modelRespElem.querySelector('.gemini-export-checkbox')) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'gemini-export-checkbox';
      cb.checked = true;
      cb.title = 'Include this Gemini response in export';
      cb.style.position = 'absolute';
      cb.style.right = '28px';
      cb.style.top = '8px';
      cb.style.zIndex = '10000';
      cb.style.transform = 'scale(1.2)';
      modelRespElem.style.position = 'relative';
      modelRespElem.appendChild(cb);
    }
  });
  // Re-apply last dropdown selection if not custom
  try {
    const select = document.getElementById('gemini-select-dropdown');
    if (select && typeof window.lastDropdownSelection !== 'undefined' && window.lastDropdownSelection !== 'custom') {
      select.value = window.lastDropdownSelection;
      if (typeof window.applyDropdownSelection === 'function') {
        window.applyDropdownSelection(window.lastDropdownSelection);
      }
    }
  } catch (e) {}
        // Check if any checkboxes are checked
        const anyChecked = Array.from(document.querySelectorAll('.gemini-export-checkbox')).some(cb => cb.checked);
        if (!anyChecked) {
          alert('Please select at least one message to export using the checkboxes or the dropdown.');
          return;
        }
  // Get conversation title from title card
  let conversationTitle = '';
  const titleCard = document.querySelector('.conversation-title');
  if (titleCard) {
    conversationTitle = titleCard.textContent.trim();
  }
  let markdown = conversationTitle 
    ? `# ${conversationTitle}\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`
    : `# Gemini Chat Export\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
  // Build Markdown for each turn, but only include checked messages
  try {
    for (let i = startTurn - 1; i < turns.length; i++) {
      const turn = turns[i];
      // Show popup log for each turn being processed
      const popup = document.createElement('div');
      popup.textContent = `Processing message ${i + 1} of ${turns.length}...`;
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
  // Removed numbered message heading for cleaner output
      // User message
      const userQueryElem = turn.querySelector('user-query');
      let userQuery = '';
      if (userQueryElem) {
        const cb = userQueryElem.querySelector('.gemini-export-checkbox');
        if (cb && cb.checked) {
          userQuery = userQueryElem.textContent.trim();
          markdown += `## 👤 You\n\n${userQuery}\n\n`;
        }
      }
      // AI response
      const modelRespElem = turn.querySelector('model-response');
      if (modelRespElem) {
        const cb = modelRespElem.querySelector('.gemini-export-checkbox');
        if (cb && cb.checked) {
          try {
            modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await sleep(500);
            const copyBtn = turn.querySelector('button[data-test-id="copy-button"]');
            if (copyBtn) {
              try { await navigator.clipboard.writeText(''); } catch (e) {}
              let attempts = 0;
              let clipboardText = '';
              while (attempts < 10) {
                modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                await sleep(200);
                copyBtn.click();
                await sleep(300);
                clipboardText = await navigator.clipboard.readText();
                if (clipboardText) break;
                attempts++;
              }
              if (!clipboardText) {
                markdown += '## 🤖 Gemini\n\n[Note: Could not copy model response. Please manually copy and paste this response from message ' + (i + 1) + '.]\n\n';
              } else {
                try {
                  const modelResponse = removeCitations(clipboardText);
                  markdown += `## 🤖 Gemini\n\n${modelResponse}\n\n`;
                } catch (e) {
                  markdown += '## 🤖 Gemini\n\n[Note: Could not read clipboard. Please check permissions.]\n\n';
                }
              }
            } else {
              markdown += '## 🤖 Gemini\n\n[Note: Copy button not found. Please check the chat UI.]\n\n';
            }
          } catch (err) {
            alert('Export stopped: Lost clipboard or page access (possibly due to tab switch or page reload). Please stay on the tab while exporting.');
            return;
          }
        }
      }
      markdown += '---\n\n';
    }
  } catch (err) {
    alert('Export stopped due to a page or clipboard error. Please keep this tab active while exporting.');
    return;
  }
  // Build output filename with current date/time in YYYY-MM-DD_HHMMSS format
  function getDateString() {
    const d = new Date();
    const pad = n => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  // Priority: custom filename > conversation title > page title > timestamp
  let filename = '';
  if (exportMode === 'file' && typeof customFilename === 'string' && customFilename.trim()) {
    let base = customFilename.trim().replace(/\.[^/.]+$/, '');
    base = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!base) base = `gemini_chat_export_${getDateString()}`;
    filename = `${base}.md`;
  } else {
    // Try conversation title from title card first
    if (conversationTitle) {
      let safeTitle = conversationTitle.replace(/[\\/:*?"<>|.]/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
      filename = safeTitle ? `${safeTitle}_${getDateString()}.md` : `gemini_chat_export_${getDateString()}.md`;
    } else {
      // Fallback to page title
      const titleElem = document.querySelector('title');
      let title = titleElem ? titleElem.textContent.trim() : '';
      if (title) {
        let safeTitle = title.replace(/[\\/:*?"<>|.]/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
        filename = safeTitle ? `${safeTitle}_${getDateString()}.md` : `gemini_chat_export_${getDateString()}.md`;
      } else {
        filename = `gemini_chat_export_${getDateString()}.md`;
      }
    }
  }

  if (exportMode === 'clipboard') {
    try {
      await navigator.clipboard.writeText(markdown);
      alert('Conversation copied to clipboard!');
      // Hide checkboxes and reset dropdown after export
      document.querySelectorAll('.gemini-export-checkbox').forEach(cb => cb.remove());
      const select = document.getElementById('gemini-select-dropdown');
      if (select) {
        select.value = 'all';
        window.lastDropdownSelection = 'all';
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
    document.querySelectorAll('.gemini-export-checkbox').forEach(cb => cb.remove());
    const select = document.getElementById('gemini-select-dropdown');
    if (select) {
      select.value = 'all';
      window.lastDropdownSelection = 'all';
    }
  }
}
