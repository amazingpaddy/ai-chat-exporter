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
 * @param {Function} [options.visibleWhen] - Optional predicate to determine visibility (must return boolean)
 */
function addExportButton({ id, buttonText, position, exportHandler, visibleWhen, includeSelectionControls = true }) {
  let observer;
  const selectionControlsEnabled = includeSelectionControls !== false;
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
          <input id="gemini-filename-input" type="text" style="margin-left:8px;padding:2px 8px;width:260px;" value="">
          <span style="display:block;font-size:0.95em;color:#888;margin-top:2px;">Optional. Leave blank to use chat title or timestamp. Only <b>.md</b> (Markdown) files are supported. Do not include an extension.</span>
        </div>
        ${selectionControlsEnabled ? `
        <div style="margin-top:14px;">
          <label style="font-weight:bold;">Select messages:</label>
          <select id="gemini-select-dropdown" style="margin-left:8px;padding:2px 8px;">
            <option value="all">All</option>
            <option value="ai">Only answers</option>
            <option value="none">None</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        ` : ''}
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
      let ensureCheckboxesInjected = () => {};
      let selectDropdown = null;
      if (selectionControlsEnabled) {
        ensureCheckboxesInjected = function ensureCheckboxesInjected() {
          const turns = Array.from(document.querySelectorAll('div.conversation-container'));
          turns.forEach((turn) => {
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
        };
        selectDropdown = dropdown.querySelector('#gemini-select-dropdown');
        if (selectDropdown) {
          if (typeof window.lastDropdownSelection === 'undefined') {
            window.lastDropdownSelection = 'all';
          }
          selectDropdown.addEventListener('change', (e) => {
            ensureCheckboxesInjected();
            const val = e.target.value;
            window.lastDropdownSelection = val;
            if (typeof window.applyDropdownSelection === 'function') {
              window.applyDropdownSelection(val);
            }
          });
        }
        const checkboxListener = (e) => {
          if (e.target && e.target.classList && e.target.classList.contains('gemini-export-checkbox')) {
            const select = document.getElementById('gemini-select-dropdown');
            if (select && select.value !== 'custom') {
              select.value = 'custom';
              window.lastDropdownSelection = 'custom';
            }
          }
        };
        document.addEventListener('change', checkboxListener);
        window.applyDropdownSelection = function(val) {
          if (val === 'all') {
            document.querySelectorAll('.gemini-export-checkbox').forEach(cb => { cb.checked = true; });
          } else if (val === 'ai') {
            document.querySelectorAll('user-query .gemini-export-checkbox').forEach(cb => { cb.checked = false; });
            document.querySelectorAll('model-response .gemini-export-checkbox').forEach(cb => { cb.checked = true; });
          } else if (val === 'none') {
            document.querySelectorAll('.gemini-export-checkbox').forEach(cb => { cb.checked = false; });
          }
        };
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
          let show = !result.hideExportBtn;
          if (typeof visibleWhen === 'function') {
            try { show = show && !!visibleWhen(); } catch (e) { show = false; }
          }
          ensureBtn(show);
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

// Add Deep Research export button (visible only when the Deep Research panel exists)
addExportButton({
  id: 'gemini-export-deep-research-btn',
  buttonText: 'Export Deep Research Report',
  position: { top: '124px', right: '20px' }, // 44px below the Export Chat button
  exportHandler: geminiDeepResearchExportMain,
  visibleWhen: () => !!document.querySelector('deep-research-immersive-panel'),
  includeSelectionControls: false
});

/**
 * Shared helpers (reused by both export flows)
 */
/** Sleep helper for async delays. */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Removes Gemini citation markers and extra newlines from text. */
function removeCitations(text) {
  return String(text)
    .replace(/\[cite_start\]/g, '')
    .replace(/\[cite:[\d,\s]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Returns current date/time in YYYY-MM-DD_HHMMSS format. */
function getDateString() {
  const d = new Date();
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Lightweight toast for progress notifications. */
function createToast(text, ttlMs = 900) {
  const popup = document.createElement('div');
  popup.textContent = text;
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
  setTimeout(() => { popup.remove(); }, ttlMs);
  return popup;
}

/** Finds conversation turn containers under the given root. */
function findTurns(root) {
  if (!root) return [];
  // Standard chat turn containers
  let turns = Array.from(root.querySelectorAll('div.conversation-container'));
  if (turns.length > 0) return turns;
  // Deep Research: operate locally within the panel. If no known containers found,
  // treat the panel itself as a single turn to ensure we can still export content.
  const isDeepResearchRoot = (root instanceof Element && root.matches('deep-research-immersive-panel'))
    || (root.querySelector && !!root.querySelector('deep-research-immersive-panel'));
  if (isDeepResearchRoot) {
    // Try any alternative selector variants first (future-proofing)
    turns = Array.from(root.querySelectorAll('[data-test-id="conversation-container"], [data-turn], .dr-turn'));
    if (turns.length > 0) return turns;
    return [root];
  }
  return turns;
}

/** Extracts the user query for a given turn with small retries. */
async function extractUserQuery(turn) {
  const userQueryElem = turn ? turn.querySelector('user-query') : null;
  if (!userQueryElem) return { ok: false, reason: 'missing', text: '' };
  let attempts = 0;
  while (attempts < 3) {
    const txt = (userQueryElem.textContent || '').trim();
    if (txt) return { ok: true, text: txt };
    attempts++;
    await sleep(100);
  }
  return { ok: false, reason: 'empty', text: '' };
}

/** Copies the model response via the Gemini copy button with retries. */
async function copyModelResponse(turn) {
  const modelRespElem = turn ? turn.querySelector('model-response') : null;
  if (!modelRespElem) {
    const fallbackText = (turn && turn.textContent ? turn.textContent.trim() : '');
    if (fallbackText) return { ok: true, text: removeCitations(fallbackText), note: 'fallback-text' };
    return { ok: false, reason: 'missing-model', text: '' };
  }
  modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await sleep(500);
  const copyBtn = turn.querySelector('button[data-test-id="copy-button"]');
  if (!copyBtn) {
    const fallbackText = (modelRespElem.textContent || '').trim() || (turn && turn.textContent || '').trim();
    if (fallbackText) return { ok: true, text: removeCitations(fallbackText), note: 'fallback-text' };
    return { ok: false, reason: 'missing-copy-button', text: '' };
  }
  try { await navigator.clipboard.writeText(''); } catch (e) {}
  let attempts = 0;
  while (attempts < 10) {
    modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await sleep(200);
    copyBtn.click();
    await sleep(300);
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) return { ok: true, text: removeCitations(clipboardText) };
    } catch (e) {
      const fallbackText = (modelRespElem.textContent || '').trim() || (turn && turn.textContent || '').trim();
      if (fallbackText) return { ok: true, text: removeCitations(fallbackText), note: 'fallback-text' };
      return { ok: false, reason: 'clipboard-permissions', text: '' };
    }
    attempts++;
  }
  const fallbackText = (modelRespElem.textContent || '').trim() || (turn && turn.textContent || '').trim();
  if (fallbackText) return { ok: true, text: removeCitations(fallbackText), note: 'fallback-text' };
  return { ok: false, reason: 'empty-clipboard', text: '' };
}

/**
 * Builds Markdown for a set of turns (shared by chat and deep research exports).
 * Title is a plain string (e.g., "Gemini Chat Export"), and will be prefixed with '# '.
 */
async function buildMarkdown(title, turns, startTurn = 1) {
  let md = `# ${title}\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
  const total = turns.length;
  for (let i = Math.max(0, startTurn - 1); i < total; i++) {
    const turn = turns[i];
    createToast(`Exporting message ${i + 1} of ${total}...`, 900);
    md += `### Message ${i + 1}\n\n`;
    // User
    const uq = await extractUserQuery(turn);
    if (uq.ok) {
      md += `## 👤 You\n\n${uq.text}\n\n`;
    } else if (uq.reason === 'missing') {
      md += '## 👤 You\n\n[Note: User query not found.]\n\n';
    } else {
      md += `## 👤 You\n\n[Note: Could not copy user query. Please manually copy and paste this query from turn ${i + 1}.]\n\n`;
    }
    // Model
    const mr = await copyModelResponse(turn);
    if (mr.ok) {
      if (mr.note === 'fallback-text') {
        md += '## 🤖 Gemini\n\n[Note: Used text content fallback due to missing copy button or permissions.]\n\n';
      }
      md += `## 🤖 Gemini\n\n${mr.text}\n\n`;
    } else if (mr.reason === 'missing-model') {
      md += '## 🤖 Gemini\n\n[Note: Model response not found.]\n\n';
    } else if (mr.reason === 'missing-copy-button') {
      md += '## 🤖 Gemini\n\n[Note: Copy button not found. Please check the chat UI.]\n\n';
    } else if (mr.reason === 'clipboard-permissions') {
      md += '## 🤖 Gemini\n\n[Note: Could not read clipboard. Please check permissions.]\n\n';
    } else {
      md += `## 🤖 Gemini\n\n[Note: Could not copy model response. Please manually copy and paste this response from turn ${i + 1}.]\n\n`;
    }
    md += `---\n\n`;
  }
  return md;
}

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
  let markdown = `# Gemini Chat Export\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
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
  // Use chat title if available, else timestamp, unless user provides filename
  let filename = '';
  const titleElem = document.querySelector('title');
  let title = titleElem ? titleElem.textContent.trim() : '';
  if (exportMode === 'file' && typeof customFilename === 'string' && customFilename.trim()) {
    let base = customFilename.trim().replace(/\.[^/.]+$/, '');
    base = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!base) base = `gemini_chat_export_${getDateString()}`;
    filename = `${base}.md`;
  } else {
    if (title) {
      let safeTitle = title.replace(/[\\/:*?"<>|.]/g, '').replace(/\s+/g, '_').replace(/^_+|_+$/g, '');
      filename = safeTitle ? `${safeTitle}_${getDateString()}.md` : `gemini_chat_export_${getDateString()}.md`;
    } else {
      filename = `gemini_chat_export_${getDateString()}.md`;
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

/**
 * Deep Research export logic scoped to <deep-research-immersive-panel>.
 * Builds markdown using shared helpers and downloads a Deep Research-specific file.
 */
async function geminiDeepResearchExportMain(startTurn = 1) {
  const panel = document.querySelector('deep-research-immersive-panel');
  if (!panel) {
    alert('Deep Research panel not found. Are you on a Deep Research session?');
    return;
  }
  // Prefer HTML→Markdown conversion for the Deep Research report content.
  // If conversion yields no content, fallback to turn-based export for resilience.
  let body = deepResearchPanelToMarkdown(panel).trim();
  if (!body) {
    const turns = findTurns(panel);
    if (!turns.length) {
      alert('No Deep Research content found in the panel.');
      return;
    }
    body = await buildMarkdown('Gemini Deep Research Report', turns, startTurn);
  } else {
    // Wrap with standard header to mirror other exports
    const header = `# Gemini Deep Research Report\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;
    body = header + body + '\n';
  }
  const markdown = body;
  const dateString = getDateString();
  const heading = panel.querySelector('h2');
  const rawTitle = heading ? heading.textContent.trim() : '';
  let safeTitle = rawTitle
    .replace(/[\\/:*?"<>|.]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!safeTitle) {
    safeTitle = `gemini_deep_research_${dateString}`;
  }
  const filename = `${safeTitle}.md`;
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

/**
 * Convert the content inside <deep-research-immersive-panel> into Markdown.
 * Follows the mapping rules defined in the roadmap, handling common HTML structures
 * and ignoring UI-only wrapper elements. Produces GitHub-flavored Markdown.
 */
function deepResearchPanelToMarkdown(panel) {
  if (!panel) return '';

  const TRANSPARENT_TAGS = new Set([
    'DIV','SPAN','SECTION','ARTICLE','MAIN','HEADER','FOOTER','ASIDE','NAV'
  ]);
  const DROP_WRAPPERS = new Set([
    'DEEP-RESEARCH-IMMERSIVE-PANEL','TOOLBAR','IMMERSIVE-TOOLBAR','RESPONSE-CONTAINER','MESSAGE-CONTENT',
    'THINKING-PANEL','COLLAPSIBLE-BUTTON','DEEP-RESEARCH-SOURCE-LISTS','CANVAS-CREATE-BUTTON',
    'MAT-MENU','MAT-ICON','BROWSE-WEB-ITEM','HORIZONTAL-SCROLL-WRAPPER',
    // generic UI placeholders/noise
    'RESPONSE-ELEMENT','SOURCE-FOOTNOTE','SOURCES-CAROUSEL-INLINE','END-OF-REPORT-MARKER'
  ]);

  const TOOLBAR_KEYWORDS = [
    'toolbar','immersive-toolbar','dr-toolbar','deep-research-toolbar','actions-bar','action-bar','command-bar'
  ];

  const toStringSafe = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try { return String(value); } catch (e) { return ''; }
  };

  const isToolbarElement = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName || '';
    if (tag === 'TOOLBAR' || tag === 'IMMERSIVE-TOOLBAR') return true;
    const role = toStringSafe(el.getAttribute && el.getAttribute('role')).toLowerCase();
    if (role === 'toolbar') return true;
    const dataTestId = toStringSafe(el.getAttribute && el.getAttribute('data-test-id')).toLowerCase();
    if (dataTestId && TOOLBAR_KEYWORDS.some(keyword => dataTestId.includes(keyword))) return true;
    const classes = toStringSafe(el.className).toLowerCase();
    if (classes && TOOLBAR_KEYWORDS.some(keyword => classes.includes(keyword))) return true;
    return false;
  };

  // Decode HTML entities using the browser
  const decoder = document.createElement('textarea');
  const decode = (s) => { decoder.innerHTML = s; return decoder.value; };

  const normalizeQuotes = (s) => s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u2007\u202F]/g, ' ');

  const isBlock = (el) => {
    const t = el.tagName;
    return [
      'P','DIV','SECTION','ARTICLE','UL','OL','LI','PRE','BLOCKQUOTE','TABLE','HR',
      'H1','H2','H3','H4','H5','H6','HEADER','FOOTER'
    ].includes(t);
  };

  const getLangFromClass = (el) => {
    if (!el || !el.className) return '';
    const m = String(el.className).match(/language-([\w#+-]+)/i);
    return m ? m[1] : '';
  };

  const escapeInlineCode = (s) => s.replace(/`/g, '\\`');

  // Inline renderer returns a string for inline contexts
  const renderInline = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeQuotes(decode(node.nodeValue || ''));
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node;
    if (isToolbarElement(el)) return '';
    const tag = el.tagName;
    switch (tag) {
      case 'B':
      case 'STRONG':
        return `**${childrenInline(el)}**`;
      case 'I':
      case 'EM':
        return `*${childrenInline(el)}*`;
      case 'CODE': {
        // If this <code> lives inside a <pre> we'll handle in block renderer
        if (el.parentElement && el.parentElement.tagName === 'PRE') return el.textContent || '';
        return '`' + escapeInlineCode(el.textContent || childrenInline(el)) + '`';
      }
      case 'A': {
        const href = el.getAttribute('href') || '';
        const text = childrenInline(el) || href;
        return `[${text}](${href})`;
      }
      case 'IMG': {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        return `![${alt}](${src})`;
      }
      case 'BR':
        return '\n';
      default:
        if (DROP_WRAPPERS.has(tag) || TRANSPARENT_TAGS.has(tag)) {
          return childrenInline(el);
        }
        return childrenInline(el);
    }
  };

  const childrenInline = (el) => Array.from(el.childNodes).map(renderInline).join('');

  // Block renderer returns array of lines for block-level nodes
  const renderBlock = (node, ctx = { listIndent: 0, inTable: false, inBlockquote: false }) => {
    const lines = [];
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.nodeValue || '').trim();
      if (text) lines.push(normalizeQuotes(decode(text)));
      return lines;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return lines;
    const el = node;
    if (isToolbarElement(el)) return lines;
    const tag = el.tagName;

    if (DROP_WRAPPERS.has(tag)) {
      Array.from(el.childNodes).forEach((c) => lines.push(...renderBlock(c, ctx)));
      return lines;
    }

    switch (tag) {
      case 'H1': lines.push(`# ${childrenInline(el).trim()}`); lines.push(''); return lines;
      case 'H2': lines.push(`## ${childrenInline(el).trim()}`); lines.push(''); return lines;
      case 'H3': lines.push(`### ${childrenInline(el).trim()}`); lines.push(''); return lines;
      case 'H4': lines.push(`#### ${childrenInline(el).trim()}`); lines.push(''); return lines;
      case 'H5': lines.push(`##### ${childrenInline(el).trim()}`); lines.push(''); return lines;
      case 'H6': lines.push(`###### ${childrenInline(el).trim()}`); lines.push(''); return lines;
      case 'P': {
        const content = childrenInline(el).trim();
        if (content) lines.push(content);
        lines.push('');
        return lines;
      }
      case 'BR':
        lines.push('');
        return lines;
      case 'HR':
        lines.push('---');
        lines.push('');
        return lines;
      case 'BLOCKQUOTE': {
        // Render inner as block lines and prefix each with '>'
        const inner = [];
        Array.from(el.childNodes).forEach((c) => inner.push(...renderBlock(c, { ...ctx, inBlockquote: true })));
        const content = collapseBlankLines(inner).map(l => l ? `> ${l}` : '>');
        lines.push(...content);
        lines.push('');
        return lines;
      }
      case 'PRE': {
        // Handle <pre><code class="language-xyz">...</code></pre>
        let language = '';
        let codeText = '';
        const codeEl = el.querySelector(':scope > code');
        if (codeEl) {
          language = getLangFromClass(codeEl) || getLangFromClass(el);
          codeText = codeEl.textContent || '';
        } else {
          language = getLangFromClass(el);
          codeText = el.textContent || '';
        }
        lines.push('```' + language);
        // Preserve code whitespace exactly
        lines.push(...codeText.replace(/\r\n/g, '\n').split('\n'));
        lines.push('```');
        lines.push('');
        return lines;
      }
      case 'UL':
      case 'OL': {
        const isOrdered = tag === 'OL';
        const items = Array.from(el.children).filter(ch => ch.tagName === 'LI');
        items.forEach((li, idx) => {
          const prefix = ' '.repeat(ctx.listIndent) + (isOrdered ? '1. ' : '- ');
          // Split li into inline lead line + nested blocks
          const liParts = renderListItem(li, { ...ctx, listIndent: ctx.listIndent + 2 });
          if (liParts.length) {
            const [first, ...rest] = liParts;
            lines.push(prefix + first);
            rest.forEach((ln) => {
              if (ln === '') { lines.push(''); }
              else lines.push(' '.repeat(ctx.listIndent + 2) + ln);
            });
          } else {
            lines.push(prefix.trimEnd());
          }
        });
        lines.push('');
        return lines;
      }
      case 'TABLE': {
        // Build GFM table
        const rows = [];
        const headRow = el.querySelector('thead tr') || el.querySelector('tr');
        const bodyRows = headRow && headRow.parentElement && headRow.parentElement.tagName === 'THEAD'
          ? Array.from(el.querySelectorAll('tbody tr'))
          : Array.from(el.querySelectorAll('tr')).slice(1);
        const headerCells = headRow ? Array.from(headRow.children).filter(n => n.tagName === 'TH' || n.tagName === 'TD') : [];
        const headers = headerCells.map(c => childrenInline(c).trim());
        if (headers.length) {
          rows.push(`| ${headers.join(' | ')} |`);
          rows.push(`| ${headers.map(() => '---').join(' | ')} |`);
        }
        bodyRows.forEach(tr => {
          const cells = Array.from(tr.children).filter(n => n.tagName === 'TD' || n.tagName === 'TH');
          const vals = cells.map(c => childrenInline(c).trim());
          rows.push(`| ${vals.join(' | ')} |`);
        });
        lines.push(...rows);
        lines.push('');
        return lines;
      }
      default: {
        if (TRANSPARENT_TAGS.has(tag)) {
          Array.from(el.childNodes).forEach((c) => lines.push(...renderBlock(c, ctx)));
          return lines;
        }
        if (!isBlock(el)) {
          const content = childrenInline(el).trim();
          if (content) lines.push(content);
          lines.push('');
          return lines;
        }
        // Generic block container: descend
        Array.from(el.childNodes).forEach((c) => lines.push(...renderBlock(c, ctx)));
        return lines;
      }
    }
  };

  const renderListItem = (li, ctx) => {
    const out = [];
    // Separate inline leading text from nested blocks
    const fragments = [];
    let encounteredBlock = false;
    Array.from(li.childNodes).forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && isBlock(n)) {
        encounteredBlock = true;
        const chunk = renderBlock(n, ctx);
        if (chunk.length) {
          if (out.length === 0) out.push(''); // placeholder for first line
          out.push(...chunk);
        }
      } else {
        fragments.push(renderInline(n));
      }
    });
    const firstLine = normalizeInline(fragments.join('')).trim();
    if (out.length === 0) {
      out.push(firstLine);
    } else {
      out[0] = firstLine;
    }
    return collapseBlankLines(out);
  };

  const normalizeInline = (s) => normalizeQuotes(decode(s)).replace(/\s+/g, (m) => m.includes('\n') ? m : ' ');

  const collapseBlankLines = (arr) => {
    const res = [];
    let blank = 0;
    for (const l of arr) {
      if (l.trim() === '') {
        if (blank === 0) res.push('');
        blank = 1;
      } else {
        res.push(rstrip(l));
        blank = 0;
      }
    }
    return res;
  };

  const rstrip = (s) => s.replace(/[ \t]+$/g, '');

  // Start rendering: drop the outer panel tag but keep its descendants
  const lines = [];
  Array.from(panel.childNodes).forEach((n) => lines.push(...renderBlock(n)));
  let md = collapseBlankLines(lines).join('\n').replace(/\n{3,}/g, '\n\n');
  // Strip Gemini-style citations and trim
  md = removeCitations(md).trim();
  return md;
}
 
