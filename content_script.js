// Gemini Chat Exporter Content Script
// Translated from the final Selenium Python script

// Inject Export button at top right if not already present

function ensureExportBtn() {
  let exportBtn = document.getElementById('gemini-export-btn');
  if (!exportBtn) {
    exportBtn = document.createElement('button');
    exportBtn.id = 'gemini-export-btn';
    exportBtn.textContent = 'Export Chat';
    exportBtn.style.position = 'fixed';
    exportBtn.style.top = '20px'; // moved down
    exportBtn.style.right = '120px'; // moved left
    exportBtn.style.zIndex = '9999';
    exportBtn.style.padding = '8px 16px';
    exportBtn.style.background = '#1a73e8';
    exportBtn.style.color = '#fff';
    exportBtn.style.border = 'none';
    exportBtn.style.borderRadius = '6px';
    exportBtn.style.fontSize = '1em';
    exportBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    exportBtn.style.cursor = 'pointer';
    exportBtn.style.fontWeight = 'bold';
    exportBtn.style.transition = 'background 0.2s';
    exportBtn.onmouseenter = () => exportBtn.style.background = '#1765c1';
    exportBtn.onmouseleave = () => exportBtn.style.background = '#1a73e8';
    exportBtn.addEventListener('click', runGeminiExport);
    document.body.appendChild(exportBtn);
  }
}

// Always ensure the button is present (in case of SPA navigation)
ensureExportBtn();
const observer = new MutationObserver(() => ensureExportBtn());
observer.observe(document.body, {childList: true, subtree: true});


async function runGeminiExport() {
  const exportBtn = document.getElementById('gemini-export-btn');
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting...';
  }
  try {
    await geminiExportMain();
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export Chat';
    }
  }
}

async function geminiExportMain() {
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Remove Gemini citation markers (ported from Python)
  function removeCitations(text) {
    return text
      .replace(/\[cite_start\]/g, '')
      .replace(/\[cite:[\d,\s]+\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // 1. Scroll to load full chat history
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

  // 2. Gather all conversation turns
  const turns = Array.from(document.querySelectorAll('div.conversation-container'));
  let markdown = `# Gemini Chat Export\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    // User query
    let userQuery = '';
    const userQueryElem = turn.querySelector('user-query');
    if (userQueryElem) {
      userQuery = userQueryElem.textContent.trim();
      markdown += `## 👤 You\n\n${userQuery}\n\n`;
    }
    // Model response
    let modelResponse = '';
    const modelRespElem = turn.querySelector('model-response');
    if (modelRespElem) {
      // Simulate hover to reveal copy button (move mouse over the center of modelRespElem)
      const rect = modelRespElem.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const mouseOverEvent = new MouseEvent('mouseover', {
        bubbles: true,
        clientX: centerX,
        clientY: centerY
      });
      modelRespElem.dispatchEvent(mouseOverEvent);
      // Actually move the mouse pointer using elementFromPoint (triggers :hover CSS)
      const elAtPoint = document.elementFromPoint(centerX, centerY);
      if (elAtPoint && elAtPoint !== modelRespElem) {
        elAtPoint.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true,
          clientX: centerX,
          clientY: centerY
        }));
      }
      await sleep(500);
      const copyBtn = turn.querySelector('button[data-test-id="copy-button"]');
      if (copyBtn) {
        // Move mouse over the copy button to ensure it's enabled
        const btnRect = copyBtn.getBoundingClientRect();
        const btnCenterX = btnRect.left + btnRect.width / 2;
        const btnCenterY = btnRect.top + btnRect.height / 2;
        copyBtn.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true,
          clientX: btnCenterX,
          clientY: btnCenterY
        }));
        await sleep(200);
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

  // 3. Download as Markdown file
  const blob = new Blob([markdown], {type: 'text/markdown'});
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
