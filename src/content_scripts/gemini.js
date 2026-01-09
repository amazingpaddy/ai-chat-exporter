/**
 * Gemini Chat Exporter - Gemini content script
 * Exports Gemini chat conversations to Markdown with LaTeX preservation
 */

(function() {
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const CONFIG = {
    BUTTON_ID: 'gemini-export-btn',
    BULK_BUTTON_ID: 'gemini-bulk-export-btn',
    DROPDOWN_ID: 'gemini-export-dropdown',
    FILENAME_INPUT_ID: 'gemini-filename-input',
    SELECT_DROPDOWN_ID: 'gemini-select-dropdown',
    CHECKBOX_CLASS: 'gemini-export-checkbox',
    EXPORT_MODE_NAME: 'gemini-export-mode',
    
    SELECTORS: {
      CHAT_CONTAINER: '[data-test-id="chat-history-container"]',
      CONVERSATION_TURN: 'div.conversation-container',
      USER_QUERY: 'user-query',
      MODEL_RESPONSE: 'model-response',
      COPY_BUTTON: 'button[data-test-id="copy-button"]',
      CONVERSATION_TITLE: '.conversation-title',
      SIDEBAR_CONVERSATIONS: 'a[href*="/app/"]'
    },
    
    TIMING: {
      SCROLL_DELAY: 2000,
      CLIPBOARD_CLEAR_DELAY: 200,
      CLIPBOARD_READ_DELAY: 300,
      MOUSEOVER_DELAY: 500,
      POPUP_DURATION: 900,
      MAX_SCROLL_ATTEMPTS: 60,
      MAX_STABLE_SCROLLS: 4,
      MAX_CLIPBOARD_ATTEMPTS: 10,
      BULK_NAV_DELAY: 3000,
      BULK_EXPORT_DELAY: 2000
    },
    
    STYLES: {
      BUTTON_PRIMARY: '#1a73e8',
      BUTTON_HOVER: '#1765c1',
      BULK_PRIMARY: '#8e44ad',
      BULK_HOVER: '#732d91',
      DARK_BG: '#111',
      DARK_TEXT: '#fff',
      DARK_BORDER: '#444',
      LIGHT_BG: '#fff',
      LIGHT_TEXT: '#222',
      LIGHT_BORDER: '#ccc'
    }
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  const Utils = {
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    isDarkMode() {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    },

    sanitizeFilename(text) {
      return text
        .replace(/[\\/:*?"<>|.]/g, '')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '');
    },

    getDateString() {
      const d = new Date();
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    },

    removeCitations(text) {
      return text
        .replace(/\[cite_start\]/g, '')
        .replace(/\[cite:[\d,\s]+\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },

    createNotification(message) {
      const popup = document.createElement('div');
      Object.assign(popup.style, {
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: '99999',
        background: '#333',
        color: '#fff',
        padding: '10px 18px',
        borderRadius: '8px',
        fontSize: '1em',
        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        opacity: '0.95',
        pointerEvents: 'none'
      });
      popup.textContent = message;
      document.body.appendChild(popup);
      setTimeout(() => popup.remove(), CONFIG.TIMING.POPUP_DURATION);
      return popup;
    }
  };

  // ============================================================================
  // CHECKBOX MANAGER
  // ============================================================================
  class CheckboxManager {
    createCheckbox(type, container) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = CONFIG.CHECKBOX_CLASS;
      cb.checked = true;
      cb.title = `Include this ${type} message in export`;
      
      Object.assign(cb.style, {
        position: 'absolute',
        right: '28px',
        top: '8px',
        zIndex: '10000',
        transform: 'scale(1.2)'
      });
      
      container.style.position = 'relative';
      container.appendChild(cb);
      return cb;
    }

    injectCheckboxes() {
      const turns = document.querySelectorAll(CONFIG.SELECTORS.CONVERSATION_TURN);
      
      turns.forEach(turn => {
        // User query checkbox
        const userQueryElem = turn.querySelector(CONFIG.SELECTORS.USER_QUERY);
        if (userQueryElem && !userQueryElem.querySelector(`.${CONFIG.CHECKBOX_CLASS}`)) {
          this.createCheckbox('user', userQueryElem);
        }
        
        // Model response checkbox
        const modelRespElem = turn.querySelector(CONFIG.SELECTORS.MODEL_RESPONSE);
        if (modelRespElem && !modelRespElem.querySelector(`.${CONFIG.CHECKBOX_CLASS}`)) {
          this.createCheckbox('Gemini', modelRespElem);
        }
      });
    }

    removeAll() {
      document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}`).forEach(cb => cb.remove());
    }

    hasAnyChecked() {
      return Array.from(document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}`))
        .some(cb => cb.checked);
    }
  }

  // ============================================================================
  // SELECTION MANAGER
  // ============================================================================
  class SelectionManager {
    constructor(checkboxManager) {
      this.checkboxManager = checkboxManager;
      this.lastSelection = 'all';
    }

    applySelection(value) {
      const checkboxes = document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}`);
      
      switch(value) {
        case 'all':
          checkboxes.forEach(cb => cb.checked = true);
          break;
        case 'ai':
          document.querySelectorAll(`${CONFIG.SELECTORS.USER_QUERY} .${CONFIG.CHECKBOX_CLASS}`)
            .forEach(cb => cb.checked = false);
          document.querySelectorAll(`${CONFIG.SELECTORS.MODEL_RESPONSE} .${CONFIG.CHECKBOX_CLASS}`)
            .forEach(cb => cb.checked = true);
          break;
        case 'none':
          checkboxes.forEach(cb => cb.checked = false);
          break;
      }
      
      this.lastSelection = value;
    }

    reset() {
      this.lastSelection = 'all';
      const select = document.getElementById(CONFIG.SELECT_DROPDOWN_ID);
      if (select) select.value = 'all';
    }

    reapplyIfNeeded() {
      const select = document.getElementById(CONFIG.SELECT_DROPDOWN_ID);
      if (select && this.lastSelection !== 'custom') {
        select.value = this.lastSelection;
        this.applySelection(this.lastSelection);
      }
    }
  }

  // ============================================================================
  // UI BUILDER
  // ============================================================================
  class UIBuilder {
    static getInputStyles(isDark) {
      return isDark 
        ? `background:${CONFIG.STYLES.DARK_BG};color:${CONFIG.STYLES.DARK_TEXT};border:1px solid ${CONFIG.STYLES.DARK_BORDER};`
        : `background:${CONFIG.STYLES.LIGHT_BG};color:${CONFIG.STYLES.LIGHT_TEXT};border:1px solid ${CONFIG.STYLES.LIGHT_BORDER};`;
    }

    static createDropdownHTML() {
      const isDark = Utils.isDarkMode();
      const inputStyles = this.getInputStyles(isDark);
      
      return `
        <div style="margin-top:10px;">
          <label style="margin-right:10px;">
            <input type="radio" name="${CONFIG.EXPORT_MODE_NAME}" value="file" checked>
            Export as file
          </label>
          <label>
            <input type="radio" name="${CONFIG.EXPORT_MODE_NAME}" value="clipboard">
            Export to clipboard
          </label>
        </div>
        <div id="gemini-filename-row" style="margin-top:10px;display:block;">
          <label for="${CONFIG.FILENAME_INPUT_ID}" style="font-weight:bold;">
            Filename <span style='color:#888;font-weight:normal;'>(optional)</span>:
          </label>
          <input id="${CONFIG.FILENAME_INPUT_ID}" type="text" 
                 style="margin-left:8px;padding:2px 8px;width:260px;${inputStyles}" 
                 value="">
          <span style="display:block;font-size:0.95em;color:#888;margin-top:2px;">
            Optional. Leave blank to use chat title or timestamp. 
            Only <b>.md</b> (Markdown) files are supported. Do not include an extension.
          </span>
        </div>
        <div style="margin-top:14px;">
          <label style="font-weight:bold;">Select messages:</label>
          <select id="${CONFIG.SELECT_DROPDOWN_ID}" 
                  style="margin-left:8px;padding:2px 8px;${inputStyles}">
            <option value="all">All</option>
            <option value="ai">Only answers</option>
            <option value="none">None</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      `;
    }

    static createButton() {
      const btn = document.createElement('button');
      btn.id = CONFIG.BUTTON_ID;
      btn.textContent = 'Export Chat';

      Object.assign(btn.style, {
        position: 'fixed',
        top: '80px',
        right: '20px',
        zIndex: '9999',
        padding: '8px 16px',
        background: CONFIG.STYLES.BUTTON_PRIMARY,
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '1em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        fontWeight: 'bold',
        transition: 'background 0.2s'
      });

      btn.addEventListener('mouseenter', () => btn.style.background = CONFIG.STYLES.BUTTON_HOVER);
      btn.addEventListener('mouseleave', () => btn.style.background = CONFIG.STYLES.BUTTON_PRIMARY);

      return btn;
    }

    static createBulkButton() {
      const btn = document.createElement('button');
      btn.id = CONFIG.BULK_BUTTON_ID;
      btn.textContent = 'Export ALL Chats';

      Object.assign(btn.style, {
        position: 'fixed',
        top: '120px',
        right: '20px',
        zIndex: '9999',
        padding: '8px 16px',
        background: CONFIG.STYLES.BULK_PRIMARY,
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '1em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        fontWeight: 'bold',
        transition: 'background 0.2s'
      });

      btn.addEventListener('mouseenter', () => btn.style.background = CONFIG.STYLES.BULK_HOVER);
      btn.addEventListener('mouseleave', () => btn.style.background = CONFIG.STYLES.BULK_PRIMARY);

      return btn;
    }

    static createDropdown() {
      const dropdown = document.createElement('div');
      dropdown.id = CONFIG.DROPDOWN_ID;
      
      const isDark = Utils.isDarkMode();
      Object.assign(dropdown.style, {
        position: 'fixed',
        top: '124px',
        right: '20px',
        zIndex: '9999',
        border: '1px solid #ccc',
        borderRadius: '6px',
        padding: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        display: 'none',
        background: isDark ? '#222' : '#fff',
        color: isDark ? '#fff' : '#222'
      });
      
      dropdown.innerHTML = this.createDropdownHTML();
      return dropdown;
    }
  }

  // ============================================================================
  // EXPORT SERVICE
  // ============================================================================
  class ExportService {
    constructor(checkboxManager) {
      this.checkboxManager = checkboxManager;
    }

    async scrollToLoadAll() {
      const scrollContainer = document.querySelector(CONFIG.SELECTORS.CHAT_CONTAINER);
      if (!scrollContainer) {
        throw new Error('Could not find chat history container. Are you on a Gemini chat page?');
      }

      let stableScrolls = 0;
      let scrollAttempts = 0;
      let lastScrollTop = null;

      while (stableScrolls < CONFIG.TIMING.MAX_STABLE_SCROLLS && 
             scrollAttempts < CONFIG.TIMING.MAX_SCROLL_ATTEMPTS) {
        const currentTurnCount = document.querySelectorAll(CONFIG.SELECTORS.CONVERSATION_TURN).length;
        scrollContainer.scrollTop = 0;
        await Utils.sleep(CONFIG.TIMING.SCROLL_DELAY);
        
        const scrollTop = scrollContainer.scrollTop;
        const newTurnCount = document.querySelectorAll(CONFIG.SELECTORS.CONVERSATION_TURN).length;
        
        if (newTurnCount === currentTurnCount && (lastScrollTop === scrollTop || scrollTop === 0)) {
          stableScrolls++;
        } else {
          stableScrolls = 0;
        }
        
        lastScrollTop = scrollTop;
        scrollAttempts++;
      }
    }

    async copyModelResponse(turn, copyBtn) {
      try {
        await navigator.clipboard.writeText('');
      } catch (e) {
        // Ignore clipboard clear errors
      }

      let attempts = 0;
      let clipboardText = '';

      while (attempts < CONFIG.TIMING.MAX_CLIPBOARD_ATTEMPTS) {
        const modelRespElem = turn.querySelector(CONFIG.SELECTORS.MODEL_RESPONSE);
        if (modelRespElem) {
          modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        }
        
        await Utils.sleep(CONFIG.TIMING.CLIPBOARD_CLEAR_DELAY);
        copyBtn.click();
        await Utils.sleep(CONFIG.TIMING.CLIPBOARD_READ_DELAY);
        
        clipboardText = await navigator.clipboard.readText();
        if (clipboardText) break;
        attempts++;
      }

      return clipboardText;
    }

    getConversationTitle() {
      const titleCard = document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE);
      return titleCard ? titleCard.textContent.trim() : '';
    }

    generateFilename(customFilename, conversationTitle) {
      // Priority: custom > conversation title > page title > timestamp
      if (customFilename && customFilename.trim()) {
        let base = customFilename.trim().replace(/\.[^/.]+$/, '');
        base = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
        return base || `gemini_chat_export_${Utils.getDateString()}`;
      }

      // Try conversation title first
      if (conversationTitle) {
        const safeTitle = Utils.sanitizeFilename(conversationTitle);
        if (safeTitle) return `${safeTitle}_${Utils.getDateString()}`;
      }

      // Fallback to page title
      const pageTitle = document.querySelector('title')?.textContent.trim();
      if (pageTitle) {
        const safeTitle = Utils.sanitizeFilename(pageTitle);
        if (safeTitle) return `${safeTitle}_${Utils.getDateString()}`;
      }

      // Final fallback
      return `gemini_chat_export_${Utils.getDateString()}`;
    }

    async buildMarkdown(turns, conversationTitle) {
      let markdown = conversationTitle
        ? `# ${conversationTitle}\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`
        : `# Gemini Chat Export\n\n> Exported on: ${new Date().toLocaleString()}\n\n---\n\n`;

      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        Utils.createNotification(`Processing message ${i + 1} of ${turns.length}...`);

        // User message
        const userQueryElem = turn.querySelector(CONFIG.SELECTORS.USER_QUERY);
        if (userQueryElem) {
          const cb = userQueryElem.querySelector(`.${CONFIG.CHECKBOX_CLASS}`);
          if (cb?.checked) {
            const userQuery = userQueryElem.textContent.trim();
            markdown += `## 👤 You\n\n${userQuery}\n\n`;
          }
        }

        // Model response
        const modelRespElem = turn.querySelector(CONFIG.SELECTORS.MODEL_RESPONSE);
        if (modelRespElem) {
          const cb = modelRespElem.querySelector(`.${CONFIG.CHECKBOX_CLASS}`);
          if (cb?.checked) {
            modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await Utils.sleep(CONFIG.TIMING.MOUSEOVER_DELAY);
            
            const copyBtn = turn.querySelector(CONFIG.SELECTORS.COPY_BUTTON);
            if (copyBtn) {
              const clipboardText = await this.copyModelResponse(turn, copyBtn);
              
              if (clipboardText) {
                const modelResponse = Utils.removeCitations(clipboardText);
                markdown += `## 🤖 Gemini\n\n${modelResponse}\n\n`;
              } else {
                markdown += `## 🤖 Gemini\n\n[Note: Could not copy model response. Please manually copy and paste this response from message ${i + 1}.]\n\n`;
              }
            } else {
              markdown += `## 🤖 Gemini\n\n[Note: Copy button not found. Please check the chat UI.]\n\n`;
            }
          }
        }

        markdown += '---\n\n';
      }

      return markdown;
    }

    async exportToClipboard(markdown) {
      await navigator.clipboard.writeText(markdown);
      alert('Conversation copied to clipboard!');
    }

    async exportToFile(markdown, filename) {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      a.href = url;
      a.download = `${filename}.md`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
    }

    async execute(exportMode, customFilename) {
      try {
        // Load all messages
        await this.scrollToLoadAll();

        // Get all turns and inject checkboxes
        const turns = Array.from(document.querySelectorAll(CONFIG.SELECTORS.CONVERSATION_TURN));
        this.checkboxManager.injectCheckboxes();

        // Check if any messages selected
        if (!this.checkboxManager.hasAnyChecked()) {
          alert('Please select at least one message to export using the checkboxes or the dropdown.');
          return;
        }

        // Get title and build markdown
        const conversationTitle = this.getConversationTitle();
        const markdown = await this.buildMarkdown(turns, conversationTitle);

        // Export based on mode
        if (exportMode === 'clipboard') {
          await this.exportToClipboard(markdown);
        } else {
          const filename = this.generateFilename(customFilename, conversationTitle);
          await this.exportToFile(markdown, filename);
        }

      } catch (error) {
        console.error('Export error:', error);
        alert(`Export failed: ${error.message}`);
      }
    }
  }

  // ============================================================================
  // CONVERSATION FINDER - Gets all conversation URLs from sidebar
  // ============================================================================
  class ConversationFinder {
    getAllConversationLinks() {
      const links = document.querySelectorAll(CONFIG.SELECTORS.SIDEBAR_CONVERSATIONS);
      const conversations = [];
      const seen = new Set();

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.includes('/app/') && !seen.has(href)) {
          seen.add(href);
          const title = link.textContent?.trim() || 'Untitled';
          const idMatch = href.match(/\/app\/([a-f0-9-]+)/);
          conversations.push({
            url: `https://gemini.google.com${href}`,
            id: idMatch ? idMatch[1] : href,
            title: title
          });
        }
      });

      return conversations;
    }

    async scrollSidebarToLoadAll() {
      const sidebar = document.querySelector('mat-sidenav, nav, [role="navigation"]');
      if (!sidebar) return;

      let lastCount = 0;
      let stableCount = 0;

      while (stableCount < 3) {
        const links = this.getAllConversationLinks();
        if (links.length === lastCount) {
          stableCount++;
        } else {
          stableCount = 0;
          lastCount = links.length;
        }
        sidebar.scrollTop = sidebar.scrollHeight;
        await Utils.sleep(1000);
      }
    }
  }

  // ============================================================================
  // BULK EXPORT SERVICE
  // ============================================================================
  class BulkExportService {
    constructor(conversationFinder, exportService) {
      this.conversationFinder = conversationFinder;
      this.exportService = exportService;
      this.aborted = false;
    }

    abort() {
      this.aborted = true;
    }

    async exportAllConversations(progressCallback) {
      this.aborted = false;

      progressCallback('Loading conversation list from sidebar...');
      await this.conversationFinder.scrollSidebarToLoadAll();

      const conversations = this.conversationFinder.getAllConversationLinks();

      if (conversations.length === 0) {
        throw new Error('No conversations found. Make sure the sidebar is visible.');
      }

      progressCallback(`Found ${conversations.length} conversations. Starting export...`);

      const results = [];

      for (let i = 0; i < conversations.length; i++) {
        if (this.aborted) {
          progressCallback(`Export cancelled. Exported ${results.length} of ${conversations.length} conversations.`);
          break;
        }

        const conv = conversations[i];
        progressCallback(`Exporting ${i + 1}/${conversations.length}: ${conv.title.substring(0, 40)}...`);

        try {
          window.location.href = conv.url;
          await Utils.sleep(CONFIG.TIMING.BULK_NAV_DELAY);

          // Wait for content to load
          await this.waitForContent();

          // Get conversation content
          const turns = Array.from(document.querySelectorAll(CONFIG.SELECTORS.CONVERSATION_TURN));

          if (turns.length > 0) {
            const title = this.exportService.getConversationTitle() || conv.title;
            let markdown = `# ${title}\n\n`;
            markdown += `> Exported from Gemini on: ${new Date().toLocaleString()}\n`;
            markdown += `> Conversation ID: ${conv.id}\n\n---\n\n`;

            for (const turn of turns) {
              // User message
              const userQueryElem = turn.querySelector(CONFIG.SELECTORS.USER_QUERY);
              if (userQueryElem) {
                const userQuery = userQueryElem.textContent.trim();
                markdown += `## 👤 You\n\n${userQuery}\n\n`;
              }

              // Model response - try to use copy button
              const modelRespElem = turn.querySelector(CONFIG.SELECTORS.MODEL_RESPONSE);
              if (modelRespElem) {
                modelRespElem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                await Utils.sleep(300);

                const copyBtn = turn.querySelector(CONFIG.SELECTORS.COPY_BUTTON);
                let responseText = '';

                if (copyBtn) {
                  try {
                    await navigator.clipboard.writeText('');
                    copyBtn.click();
                    await Utils.sleep(300);
                    responseText = await navigator.clipboard.readText();
                  } catch (e) {
                    responseText = modelRespElem.textContent.trim();
                  }
                } else {
                  responseText = modelRespElem.textContent.trim();
                }

                responseText = Utils.removeCitations(responseText);
                markdown += `## 🤖 Gemini\n\n${responseText}\n\n`;
              }

              markdown += '---\n\n';
            }

            results.push({
              id: conv.id,
              title: title,
              markdown: markdown,
              messageCount: turns.length
            });
          }

        } catch (err) {
          console.error(`Failed to export ${conv.id}:`, err);
          results.push({
            id: conv.id,
            title: conv.title,
            error: err.message
          });
        }

        await Utils.sleep(CONFIG.TIMING.BULK_EXPORT_DELAY);
      }

      return results;
    }

    async waitForContent() {
      let attempts = 0;
      while (attempts < 20) {
        const turns = document.querySelectorAll(CONFIG.SELECTORS.CONVERSATION_TURN);
        if (turns.length > 0) return;
        await Utils.sleep(500);
        attempts++;
      }
    }

    createBulkExportFile(results) {
      const timestamp = Utils.getDateString();

      let combinedMarkdown = `# Gemini Conversations Export\n\n`;
      combinedMarkdown += `> Exported on: ${new Date().toLocaleString()}\n`;
      combinedMarkdown += `> Total conversations: ${results.length}\n\n`;
      combinedMarkdown += `---\n\n# Table of Contents\n\n`;

      results.forEach((r, i) => {
        if (!r.error) {
          combinedMarkdown += `${i + 1}. [${r.title}](#conversation-${i + 1})\n`;
        }
      });

      combinedMarkdown += `\n---\n\n`;

      results.forEach((r, i) => {
        if (!r.error) {
          combinedMarkdown += `<a id="conversation-${i + 1}"></a>\n\n`;
          combinedMarkdown += r.markdown;
          combinedMarkdown += `\n\n`;
        }
      });

      const blob = new Blob([combinedMarkdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gemini_all_chats_${timestamp}.md`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      return `gemini_all_chats_${timestamp}.md`;
    }
  }

  // ============================================================================
  // EXPORT CONTROLLER
  // ============================================================================
  class ExportController {
    constructor() {
      this.checkboxManager = new CheckboxManager();
      this.selectionManager = new SelectionManager(this.checkboxManager);
      this.exportService = new ExportService(this.checkboxManager);
      this.conversationFinder = new ConversationFinder();
      this.bulkExportService = new BulkExportService(this.conversationFinder, this.exportService);
      this.button = null;
      this.bulkButton = null;
      this.dropdown = null;
      this.isBulkExporting = false;
    }

    init() {
      this.createUI();
      this.attachEventListeners();
      this.observeStorageChanges();
    }

    createUI() {
      this.button = UIBuilder.createButton();
      this.bulkButton = UIBuilder.createBulkButton();
      this.dropdown = UIBuilder.createDropdown();

      document.body.appendChild(this.dropdown);
      document.body.appendChild(this.button);
      document.body.appendChild(this.bulkButton);

      this.setupFilenameRowToggle();
    }

    setupFilenameRowToggle() {
      const updateFilenameRow = () => {
        const fileRow = this.dropdown.querySelector('#gemini-filename-row');
        const fileRadio = this.dropdown.querySelector(`input[name="${CONFIG.EXPORT_MODE_NAME}"][value="file"]`);
        if (fileRow && fileRadio) {
          fileRow.style.display = fileRadio.checked ? 'block' : 'none';
        }
      };

      this.dropdown.querySelectorAll(`input[name="${CONFIG.EXPORT_MODE_NAME}"]`)
        .forEach(radio => radio.addEventListener('change', updateFilenameRow));
      
      updateFilenameRow();
    }

    attachEventListeners() {
      // Button click
      this.button.addEventListener('click', () => this.handleButtonClick());

      // Bulk export button
      this.bulkButton.addEventListener('click', () => this.handleBulkExport());

      // Selection dropdown
      const selectDropdown = this.dropdown.querySelector(`#${CONFIG.SELECT_DROPDOWN_ID}`);
      selectDropdown.addEventListener('change', (e) => this.handleSelectionChange(e.target.value));

      // Checkbox manual changes
      document.addEventListener('change', (e) => {
        if (e.target?.classList?.contains(CONFIG.CHECKBOX_CLASS)) {
          const select = document.getElementById(CONFIG.SELECT_DROPDOWN_ID);
          if (select && select.value !== 'custom') {
            select.value = 'custom';
            this.selectionManager.lastSelection = 'custom';
          }
        }
      });

      // Click outside to hide dropdown
      document.addEventListener('mousedown', (e) => {
        if (this.dropdown.style.display !== 'none' && 
            !this.dropdown.contains(e.target) && 
            e.target !== this.button) {
          this.dropdown.style.display = 'none';
        }
      });
    }

    handleSelectionChange(value) {
      this.checkboxManager.injectCheckboxes();
      this.selectionManager.applySelection(value);
    }

    async handleButtonClick() {
      this.checkboxManager.injectCheckboxes();
      
      if (this.dropdown.style.display === 'none') {
        this.dropdown.style.display = '';
        return;
      }

      this.button.disabled = true;
      this.button.textContent = 'Exporting...';

      try {
        const exportMode = this.dropdown.querySelector(`input[name="${CONFIG.EXPORT_MODE_NAME}"]:checked`)?.value || 'file';
        const customFilename = exportMode === 'file' 
          ? this.dropdown.querySelector(`#${CONFIG.FILENAME_INPUT_ID}`)?.value.trim() || ''
          : '';

        this.dropdown.style.display = 'none';
        
        await this.exportService.execute(exportMode, customFilename);

        // Cleanup after export
        this.checkboxManager.removeAll();
        this.selectionManager.reset();
        
        if (exportMode === 'file') {
          const filenameInput = this.dropdown.querySelector(`#${CONFIG.FILENAME_INPUT_ID}`);
          if (filenameInput) filenameInput.value = '';
        }

      } catch (error) {
        console.error('Export error:', error);
      } finally {
        this.button.disabled = false;
        this.button.textContent = 'Export Chat';
      }
    }

    async handleBulkExport() {
      if (this.isBulkExporting) {
        this.bulkExportService.abort();
        return;
      }

      const confirmed = confirm(
        'This will export ALL your Gemini conversations.\n\n' +
        'The browser will navigate through each conversation to extract content.\n' +
        'This may take several minutes depending on how many conversations you have.\n\n' +
        'Continue?'
      );

      if (!confirmed) return;

      this.isBulkExporting = true;
      this.bulkButton.textContent = 'Cancel Export';
      this.bulkButton.style.background = '#dc3545';
      this.button.style.display = 'none';

      const notification = Utils.createNotification('Starting bulk export...');
      const updateNotification = (msg) => {
        notification.textContent = msg;
      };

      try {
        const results = await this.bulkExportService.exportAllConversations(updateNotification);

        if (results.length > 0) {
          const filename = this.bulkExportService.createBulkExportFile(results);
          const successCount = results.filter(r => !r.error).length;
          notification.textContent = `✓ Exported ${successCount} conversations to ${filename}`;
          setTimeout(() => notification.remove(), 5000);
        }

      } catch (error) {
        console.error('Bulk export error:', error);
        notification.textContent = `Bulk export failed: ${error.message}`;
        setTimeout(() => notification.remove(), 5000);
      } finally {
        this.isBulkExporting = false;
        this.bulkButton.textContent = 'Export ALL Chats';
        this.bulkButton.style.background = CONFIG.STYLES.BULK_PRIMARY;
        this.button.style.display = '';
      }
    }

    observeStorageChanges() {
      const updateVisibility = () => {
        try {
          if (chrome?.storage?.sync) {
            chrome.storage.sync.get(['hideExportBtn'], (result) => {
              this.button.style.display = result.hideExportBtn ? 'none' : '';
            });
          }
        } catch (e) {
          console.error('Storage access error:', e);
        }
      };

      updateVisibility();

      const observer = new MutationObserver(updateVisibility);
      observer.observe(document.body, { childList: true, subtree: true });

      if (chrome?.storage?.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'sync' && 'hideExportBtn' in changes) {
            updateVisibility();
          }
        });
      }
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  const controller = new ExportController();
  controller.init();

})();
