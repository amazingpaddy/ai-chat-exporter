// Gemini Chat Exporter Chrome Extension - Content Script
// Adds an 'Export Chat' button to Gemini chat pages, allowing users to export the full conversation to Markdown.
// Copyright (c) 2025 amazingpaddy
// License: Apache-2.0

/**
 * Ensures the Export Chat button is present on the page.
 * The button is injected at the top right (not overlapping the profile icon) and triggers the export process.
 */
function ensureExportBtn() {
  let exportBtn = document.getElementById('gemini-export-btn');
  if (!exportBtn) {
    exportBtn = document.createElement('button');
    exportBtn.id = 'gemini-export-btn';
    exportBtn.textContent = 'Export Chat';
    exportBtn.style.position = 'fixed';
    exportBtn.style.top = '20px'; // moved down to avoid profile icon
    exportBtn.style.right = '120px'; // moved left to avoid profile icon
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

// Observe DOM changes to re-inject the button if needed (for SPA navigation)
ensureExportBtn();
const observer = new MutationObserver(() => ensureExportBtn());
observer.observe(document.body, { childList: true, subtree: true });

/**
 * Handles the export button click: disables the button, shows progress, and runs the export.
 */
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

/**
 * Main export logic: scrolls to load all chat, copies each turn, and downloads as Markdown.
 */
async function geminiExportMain() {
  // Utility: sleep for a given number of milliseconds
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Utility: remove Gemini citation markers from text
  function removeCitations(text) {
    return text
      .replace(/\[cite_start\]/g, '')
      .replace(/\[cite:[\d,\s]+\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Step 1: Scroll to load full chat history
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

  // Step 2: Gather all conversation turns and build Markdown
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
      // Simulate hover to reveal copy button
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

  // Step 3: Download as Markdown file
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
