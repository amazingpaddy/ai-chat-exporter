/**
 * Claude Chat Exporter - Claude.ai content script
 * Exports Claude chat conversations to Markdown with bulk export support
 */

(function() {
  'use strict';

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const CONFIG = {
    BUTTON_ID: 'claude-export-btn',
    BULK_BUTTON_ID: 'claude-bulk-export-btn',
    DROPDOWN_ID: 'claude-export-dropdown',
    FILENAME_INPUT_ID: 'claude-filename-input',
    SELECT_DROPDOWN_ID: 'claude-select-dropdown',
    CHECKBOX_CLASS: 'claude-export-checkbox',
    EXPORT_MODE_NAME: 'claude-export-mode',

    SELECTORS: {
      // Conversation list in sidebar
      SIDEBAR_CONVERSATIONS: 'a[href^="/chat/"]',
      CONVERSATION_CONTAINER: '[data-testid="conversation-turn-"]',
      // Alternative selectors for Claude's message structure
      MESSAGE_CONTAINER: 'div[data-is-streaming]',
      HUMAN_MESSAGE: '[data-testid="user-message"]',
      ASSISTANT_MESSAGE: '[data-testid="assistant-message"]',
      // Fallback selectors based on Claude's typical structure
      HUMAN_TURN: 'div.font-user-message',
      ASSISTANT_TURN: 'div.font-claude-message',
      COPY_BUTTON: 'button[aria-label="Copy"]',
      CONVERSATION_TITLE: 'title'
    },

    TIMING: {
      SCROLL_DELAY: 1500,
      CLIPBOARD_CLEAR_DELAY: 200,
      CLIPBOARD_READ_DELAY: 300,
      MOUSEOVER_DELAY: 300,
      POPUP_DURATION: 1200,
      MAX_SCROLL_ATTEMPTS: 60,
      MAX_STABLE_SCROLLS: 4,
      MAX_CLIPBOARD_ATTEMPTS: 10,
      BULK_NAV_DELAY: 3000,
      BULK_EXPORT_DELAY: 2000
    },

    STYLES: {
      BUTTON_PRIMARY: '#c96442',
      BUTTON_HOVER: '#a85636',
      BULK_PRIMARY: '#6b46c1',
      BULK_HOVER: '#553c9a',
      DARK_BG: '#1a1a1a',
      DARK_TEXT: '#f5f5f5',
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
      // Claude uses dark mode by default, check body class or media query
      return document.documentElement.classList.contains('dark') ||
             (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    },

    sanitizeFilename(text) {
      return text
        .replace(/[\\/:*?"<>|.]/g, '')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 100);
    },

    getDateString() {
      const d = new Date();
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    },

    createNotification(message, duration = CONFIG.TIMING.POPUP_DURATION) {
      // Remove existing notifications
      document.querySelectorAll('.claude-export-notification').forEach(n => n.remove());

      const popup = document.createElement('div');
      popup.className = 'claude-export-notification';
      Object.assign(popup.style, {
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: '99999',
        background: '#333',
        color: '#fff',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '0.95em',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        opacity: '0.95',
        maxWidth: '400px'
      });
      popup.textContent = message;
      document.body.appendChild(popup);
      if (duration > 0) {
        setTimeout(() => popup.remove(), duration);
      }
      return popup;
    },

    getCurrentConversationId() {
      const match = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/);
      return match ? match[1] : null;
    }
  };

  // ============================================================================
  // CONVERSATION FINDER - Gets all conversation URLs from /recents page
  // ============================================================================
  class ConversationFinder {
    getAllConversationLinks() {
      // Get all links that point to /chat/ URLs
      const links = document.querySelectorAll('a[href^="/chat/"]');
      const conversations = [];
      const seen = new Set();

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('/chat/') && !seen.has(href)) {
          seen.add(href);
          // Try to get conversation title from the link text
          const title = link.textContent?.trim() || 'Untitled';
          conversations.push({
            url: `https://claude.ai${href}`,
            id: href.replace('/chat/', ''),
            title: title.substring(0, 100)
          });
        }
      });

      return conversations;
    }

    async loadAllConversationsFromRecents(progressCallback) {
      // First, navigate to /recents if not already there
      if (!window.location.pathname.includes('/recents')) {
        progressCallback('Navigating to recents page...');
        window.location.href = 'https://claude.ai/recents';
        // The page will reload, so we return and let it re-initialize
        return null;
      }

      progressCallback('Loading all conversations from recents...');
      await Utils.sleep(2000); // Wait for initial load

      let lastCount = 0;
      let clickAttempts = 0;
      const maxAttempts = 500; // Safety limit for 2670+ chats

      while (clickAttempts < maxAttempts) {
        const currentCount = this.getAllConversationLinks().length;
        progressCallback(`Loaded ${currentCount} conversations... clicking "Show more"`);

        // Find and click "Show more" button
        const showMoreBtn = this.findShowMoreButton();

        if (!showMoreBtn) {
          // No more button found - check if we're done or need to scroll
          progressCallback(`No "Show more" button found. Total: ${currentCount} conversations`);

          // Try scrolling to bottom to trigger lazy load
          window.scrollTo(0, document.body.scrollHeight);
          await Utils.sleep(1000);

          const newCount = this.getAllConversationLinks().length;
          if (newCount === currentCount) {
            // No new items loaded, we're done
            break;
          }
          continue;
        }

        // Click the show more button
        showMoreBtn.click();
        await Utils.sleep(1500); // Wait for new items to load

        const newCount = this.getAllConversationLinks().length;

        if (newCount === lastCount) {
          // No new items, might be rate limited or done
          await Utils.sleep(2000);
          clickAttempts++;
        } else {
          clickAttempts = 0; // Reset if we got new items
        }

        lastCount = newCount;
      }

      const conversations = this.getAllConversationLinks();
      progressCallback(`Found ${conversations.length} total conversations`);
      return conversations;
    }

    findShowMoreButton() {
      // Try various selectors for the "Show more" button
      const selectors = [
        'button:contains("Show more")',
        'button:contains("Load more")',
        'button:contains("More")',
        '[data-testid="show-more"]',
        '[data-testid="load-more"]',
      ];

      // First try: look for button with "Show more" or "Load more" text
      const allButtons = document.querySelectorAll('button');
      for (const btn of allButtons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('show more') || text.includes('load more') || text === 'more') {
          return btn;
        }
      }

      // Second try: look for a "load more" style div/button at bottom
      const loadMoreElements = document.querySelectorAll('[class*="load"], [class*="more"]');
      for (const elem of loadMoreElements) {
        if (elem.tagName === 'BUTTON' || elem.role === 'button') {
          const text = elem.textContent?.toLowerCase() || '';
          if (text.includes('more') || text.includes('load')) {
            return elem;
          }
        }
      }

      return null;
    }
  }

  // ============================================================================
  // MESSAGE EXTRACTOR - Extracts messages from current page
  // ============================================================================
  class MessageExtractor {
    getMessages() {
      const messages = [];

      // Try multiple selector strategies for Claude's DOM
      const strategies = [
        this.extractByTestId.bind(this),
        this.extractByAriaRoles.bind(this),
        this.extractByClassPattern.bind(this),
        this.extractByStructure.bind(this)
      ];

      for (const strategy of strategies) {
        const result = strategy();
        if (result.length > 0) {
          return result;
        }
      }

      return messages;
    }

    extractByTestId() {
      const messages = [];
      const humanMsgs = document.querySelectorAll('[data-testid="user-message"]');
      const assistantMsgs = document.querySelectorAll('[data-testid="assistant-message"]');

      // Interleave based on DOM position
      const allMsgs = [...document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')];

      allMsgs.forEach(msg => {
        const isHuman = msg.matches('[data-testid="user-message"]');
        messages.push({
          role: isHuman ? 'human' : 'assistant',
          content: msg.textContent?.trim() || '',
          element: msg
        });
      });

      return messages;
    }

    extractByAriaRoles() {
      const messages = [];
      // Look for elements with role indicators
      const turns = document.querySelectorAll('[role="presentation"], [role="article"]');

      turns.forEach(turn => {
        const text = turn.textContent?.trim();
        if (!text) return;

        // Detect role by preceding label or class
        const isHuman = turn.querySelector('.human, [data-role="human"]') !== null ||
                       turn.closest('[data-role="human"]') !== null;

        messages.push({
          role: isHuman ? 'human' : 'assistant',
          content: text,
          element: turn
        });
      });

      return messages;
    }

    extractByClassPattern() {
      const messages = [];

      // Claude often uses specific class patterns
      const humanPattern = /human|user|query|prompt/i;
      const assistantPattern = /assistant|claude|response|answer/i;

      const containers = document.querySelectorAll('div[class*="message"], div[class*="turn"], div[class*="chat"]');

      containers.forEach(container => {
        const className = container.className || '';
        const text = container.textContent?.trim();
        if (!text || text.length < 2) return;

        if (humanPattern.test(className)) {
          messages.push({ role: 'human', content: text, element: container });
        } else if (assistantPattern.test(className)) {
          messages.push({ role: 'assistant', content: text, element: container });
        }
      });

      return messages;
    }

    extractByStructure() {
      const messages = [];

      // Look for alternating message blocks in the main content area
      const main = document.querySelector('main') || document.querySelector('[role="main"]');
      if (!main) return messages;

      // Find direct children that look like message containers
      const children = main.querySelectorAll(':scope > div > div, :scope > div');
      let currentRole = 'human'; // Usually starts with human

      children.forEach(child => {
        const text = child.textContent?.trim();
        if (!text || text.length < 5) return;

        // Skip if it looks like UI elements
        if (child.querySelector('button, input, nav')) return;

        messages.push({
          role: currentRole,
          content: text,
          element: child
        });

        currentRole = currentRole === 'human' ? 'assistant' : 'human';
      });

      return messages;
    }

    async copyViaClipboard(element) {
      // Try to find and click the copy button
      const copyBtn = element.querySelector(CONFIG.SELECTORS.COPY_BUTTON) ||
                     element.parentElement?.querySelector(CONFIG.SELECTORS.COPY_BUTTON);

      if (copyBtn) {
        try {
          await navigator.clipboard.writeText('');
          copyBtn.click();
          await Utils.sleep(CONFIG.TIMING.CLIPBOARD_READ_DELAY);
          return await navigator.clipboard.readText();
        } catch (e) {
          console.log('Clipboard copy failed, using textContent');
        }
      }

      return element.textContent?.trim() || '';
    }
  }

  // ============================================================================
  // CHECKBOX MANAGER
  // ============================================================================
  class CheckboxManager {
    createCheckbox(element, role) {
      if (element.querySelector(`.${CONFIG.CHECKBOX_CLASS}`)) return;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = `${CONFIG.CHECKBOX_CLASS} ${role}`;
      cb.checked = true;
      cb.title = `Include this ${role} message in export`;

      Object.assign(cb.style, {
        position: 'absolute',
        right: '8px',
        top: '8px',
        zIndex: '10000',
        transform: 'scale(1.2)',
        cursor: 'pointer'
      });

      element.style.position = 'relative';
      element.appendChild(cb);
      return cb;
    }

    injectCheckboxes(messages) {
      messages.forEach(msg => {
        if (msg.element) {
          this.createCheckbox(msg.element, msg.role);
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

    getCheckedMessages(messages) {
      return messages.filter(msg => {
        const cb = msg.element?.querySelector(`.${CONFIG.CHECKBOX_CLASS}`);
        return cb ? cb.checked : true;
      });
    }
  }

  // ============================================================================
  // SELECTION MANAGER
  // ============================================================================
  class SelectionManager {
    constructor() {
      this.lastSelection = 'all';
    }

    applySelection(value) {
      const checkboxes = document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}`);

      switch(value) {
        case 'all':
          checkboxes.forEach(cb => cb.checked = true);
          break;
        case 'ai':
          document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}.human`)
            .forEach(cb => cb.checked = false);
          document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}.assistant`)
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
        fontSize: '0.95em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
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
        fontSize: '0.95em',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
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
      const inputStyles = this.getInputStyles(isDark);

      Object.assign(dropdown.style, {
        position: 'fixed',
        top: '160px',
        right: '20px',
        zIndex: '9999',
        border: '1px solid #444',
        borderRadius: '8px',
        padding: '14px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        display: 'none',
        background: isDark ? '#2d2d2d' : '#fff',
        color: isDark ? '#f5f5f5' : '#222',
        minWidth: '320px'
      });

      dropdown.innerHTML = `
        <div style="margin-bottom:12px;font-weight:bold;font-size:1.05em;">Export Options</div>
        <div style="margin-top:10px;">
          <label style="margin-right:14px;cursor:pointer;">
            <input type="radio" name="${CONFIG.EXPORT_MODE_NAME}" value="file" checked>
            Save as file
          </label>
          <label style="cursor:pointer;">
            <input type="radio" name="${CONFIG.EXPORT_MODE_NAME}" value="clipboard">
            Copy to clipboard
          </label>
        </div>
        <div id="claude-filename-row" style="margin-top:12px;display:block;">
          <label for="${CONFIG.FILENAME_INPUT_ID}" style="font-weight:bold;display:block;margin-bottom:4px;">
            Filename <span style='color:#888;font-weight:normal;'>(optional)</span>
          </label>
          <input id="${CONFIG.FILENAME_INPUT_ID}" type="text"
                 style="padding:6px 10px;width:100%;box-sizing:border-box;border-radius:4px;${inputStyles}"
                 placeholder="Leave blank for auto-generated name">
        </div>
        <div style="margin-top:14px;">
          <label style="font-weight:bold;">Select messages:</label>
          <select id="${CONFIG.SELECT_DROPDOWN_ID}"
                  style="margin-left:8px;padding:4px 10px;border-radius:4px;${inputStyles}">
            <option value="all">All messages</option>
            <option value="ai">Claude responses only</option>
            <option value="none">None (manual select)</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div style="margin-top:16px;display:flex;gap:10px;">
          <button id="claude-export-confirm" style="flex:1;padding:8px;background:${CONFIG.STYLES.BUTTON_PRIMARY};color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
            Export
          </button>
          <button id="claude-export-cancel" style="padding:8px 16px;background:#666;color:#fff;border:none;border-radius:6px;cursor:pointer;">
            Cancel
          </button>
        </div>
      `;

      return dropdown;
    }
  }

  // ============================================================================
  // EXPORT SERVICE
  // ============================================================================
  class ExportService {
    constructor(checkboxManager, messageExtractor) {
      this.checkboxManager = checkboxManager;
      this.messageExtractor = messageExtractor;
    }

    getConversationTitle() {
      // Try multiple ways to get the title
      const titleElem = document.querySelector('title');
      let title = titleElem?.textContent?.trim() || '';

      // Remove " - Claude" suffix if present
      title = title.replace(/\s*[-–]\s*Claude\s*$/i, '');

      // If title is empty or generic, try other sources
      if (!title || title.toLowerCase() === 'claude') {
        // Try to get from URL or first message
        const convId = Utils.getCurrentConversationId();
        if (convId) title = `Claude Chat ${convId.substring(0, 8)}`;
      }

      return title || 'Claude Chat';
    }

    generateFilename(customFilename, conversationTitle) {
      if (customFilename && customFilename.trim()) {
        let base = customFilename.trim().replace(/\.[^/.]+$/, '');
        base = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
        return base || `claude_chat_${Utils.getDateString()}`;
      }

      if (conversationTitle) {
        const safeTitle = Utils.sanitizeFilename(conversationTitle);
        if (safeTitle) return `${safeTitle}_${Utils.getDateString()}`;
      }

      return `claude_chat_${Utils.getDateString()}`;
    }

    buildMarkdown(messages, conversationTitle) {
      let markdown = `# ${conversationTitle}\n\n`;
      markdown += `> Exported from Claude.ai on: ${new Date().toLocaleString()}\n\n---\n\n`;

      messages.forEach((msg, idx) => {
        const roleLabel = msg.role === 'human' ? '👤 You' : '🤖 Claude';
        markdown += `## ${roleLabel}\n\n${msg.content}\n\n---\n\n`;
      });

      return markdown;
    }

    async exportToClipboard(markdown) {
      await navigator.clipboard.writeText(markdown);
      Utils.createNotification('✓ Conversation copied to clipboard!');
    }

    async exportToFile(markdown, filename) {
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
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

      Utils.createNotification(`✓ Saved as ${filename}.md`);
    }

    async execute(exportMode, customFilename) {
      const messages = this.messageExtractor.getMessages();

      if (messages.length === 0) {
        Utils.createNotification('No messages found to export. Make sure you are on a chat page.');
        return null;
      }

      this.checkboxManager.injectCheckboxes(messages);

      const checkedMessages = this.checkboxManager.getCheckedMessages(messages);

      if (checkedMessages.length === 0) {
        Utils.createNotification('Please select at least one message to export.');
        return null;
      }

      const conversationTitle = this.getConversationTitle();
      const markdown = this.buildMarkdown(checkedMessages, conversationTitle);

      if (exportMode === 'clipboard') {
        await this.exportToClipboard(markdown);
      } else {
        const filename = this.generateFilename(customFilename, conversationTitle);
        await this.exportToFile(markdown, filename);
      }

      this.checkboxManager.removeAll();
      return { title: conversationTitle, messageCount: checkedMessages.length };
    }
  }

  // ============================================================================
  // BULK EXPORT SERVICE
  // ============================================================================
  class BulkExportService {
    constructor(conversationFinder, messageExtractor) {
      this.conversationFinder = conversationFinder;
      this.messageExtractor = messageExtractor;
      this.aborted = false;
    }

    abort() {
      this.aborted = true;
    }

    async exportAllConversations(progressCallback) {
      this.aborted = false;

      // Load all conversations from /recents page
      const conversations = await this.conversationFinder.loadAllConversationsFromRecents(progressCallback);

      // If null, page is navigating to /recents - will re-init
      if (conversations === null) {
        return [];
      }

      if (conversations.length === 0) {
        throw new Error('No conversations found. Make sure you are on the recents page.');
      }

      return this.exportConversationList(conversations, progressCallback);
    }

    async exportConversationList(conversations, progressCallback) {
      this.aborted = false;
      progressCallback(`Starting export of ${conversations.length} conversations via API...`);

      // First, get the organization ID from the current page
      const orgId = await this.getOrganizationId();
      if (!orgId) {
        throw new Error('Could not determine organization ID. Make sure you are logged into Claude.');
      }

      progressCallback(`Found org ID: ${orgId}. Starting export...`);

      const results = [];

      for (let i = 0; i < conversations.length; i++) {
        if (this.aborted) {
          progressCallback(`Export cancelled. Exported ${results.length} of ${conversations.length} conversations.`);
          if (results.length > 0) {
            this.createBulkExportFile(results);
          }
          break;
        }

        const conv = conversations[i];
        progressCallback(`Exporting ${i + 1}/${conversations.length}: ${conv.title?.substring(0, 40) || conv.id}...`);

        try {
          // Fetch conversation data via API
          const chatData = await this.fetchConversation(orgId, conv.id);

          if (chatData && chatData.chat_messages && chatData.chat_messages.length > 0) {
            const title = chatData.name || conv.title || 'Untitled';
            let markdown = `# ${title}\n\n`;
            markdown += `> Exported from Claude.ai on: ${new Date().toLocaleString()}\n`;
            markdown += `> Conversation ID: ${conv.id}\n`;
            markdown += `> URL: ${conv.url}\n`;
            markdown += `> Created: ${chatData.created_at || 'Unknown'}\n\n---\n\n`;

            chatData.chat_messages.forEach(msg => {
              const roleLabel = msg.sender === 'human' ? '👤 You' : '🤖 Claude';
              // Extract text content from the message
              let content = '';
              if (msg.text) {
                content = msg.text;
              } else if (msg.content && Array.isArray(msg.content)) {
                content = msg.content
                  .filter(c => c.type === 'text')
                  .map(c => c.text)
                  .join('\n\n');
              }

              if (content) {
                markdown += `## ${roleLabel}\n\n${content}\n\n---\n\n`;
              }
            });

            results.push({
              id: conv.id,
              title: title,
              markdown: markdown,
              messageCount: chatData.chat_messages.length
            });

            // Save progress every 50 conversations
            if (results.length % 50 === 0) {
              progressCallback(`Checkpoint: Saved ${results.length} conversations so far...`);
              this.createBulkExportFile(results, true);
            }
          } else {
            results.push({
              id: conv.id,
              title: conv.title || 'Unknown',
              error: 'No messages found'
            });
          }

        } catch (err) {
          console.error(`Failed to export ${conv.id}:`, err);
          results.push({
            id: conv.id,
            title: conv.title || 'Unknown',
            error: err.message
          });
        }

        // Small delay to avoid rate limiting
        await Utils.sleep(200);
      }

      return results;
    }

    async getOrganizationId() {
      // Try to get org ID from the page or API
      try {
        // Method 1: Check if it's in the URL or page data
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          const match = text.match(/"organizationId"\s*:\s*"([a-f0-9-]+)"/);
          if (match) return match[1];
        }

        // Method 2: Fetch from organizations endpoint
        const response = await fetch('https://claude.ai/api/organizations', {
          credentials: 'include'
        });
        if (response.ok) {
          const orgs = await response.json();
          if (orgs && orgs.length > 0) {
            return orgs[0].uuid;
          }
        }

        // Method 3: Try to extract from any API call in network
        // This is a fallback - check localStorage or cookies
        const cookies = document.cookie;
        const orgMatch = cookies.match(/organization[_-]?id=([a-f0-9-]+)/i);
        if (orgMatch) return orgMatch[1];

      } catch (err) {
        console.error('Error getting org ID:', err);
      }
      return null;
    }

    async fetchConversation(orgId, conversationId) {
      const url = `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return response.json();
    }

    async waitForContent() {
      let attempts = 0;
      while (attempts < 20) {
        const messages = this.messageExtractor.getMessages();
        if (messages.length > 0) return;
        await Utils.sleep(500);
        attempts++;
      }
    }

    createBulkExportFile(results, isPartial = false) {
      const timestamp = Utils.getDateString();
      const successResults = results.filter(r => !r.error);

      // Create a combined markdown file
      let combinedMarkdown = `# Claude Conversations Export${isPartial ? ' (Partial)' : ''}\n\n`;
      combinedMarkdown += `> Exported on: ${new Date().toLocaleString()}\n`;
      combinedMarkdown += `> Total conversations: ${successResults.length}${isPartial ? ' (in progress)' : ''}\n\n`;
      combinedMarkdown += `---\n\n# Table of Contents\n\n`;

      successResults.forEach((r, i) => {
        combinedMarkdown += `${i + 1}. [${r.title}](#conversation-${i + 1})\n`;
      });

      combinedMarkdown += `\n---\n\n`;

      successResults.forEach((r, i) => {
        combinedMarkdown += `<a id="conversation-${i + 1}"></a>\n\n`;
        combinedMarkdown += r.markdown;
        combinedMarkdown += `\n\n`;
      });

      // Create and download the file
      const prefix = isPartial ? 'claude_chats_partial' : 'claude_all_chats';
      const blob = new Blob([combinedMarkdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${prefix}_${timestamp}.md`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      return `${prefix}_${timestamp}.md`;
    }
  }

  // ============================================================================
  // EXPORT CONTROLLER
  // ============================================================================
  class ExportController {
    constructor() {
      this.checkboxManager = new CheckboxManager();
      this.selectionManager = new SelectionManager();
      this.messageExtractor = new MessageExtractor();
      this.conversationFinder = new ConversationFinder();
      this.exportService = new ExportService(this.checkboxManager, this.messageExtractor);
      this.bulkExportService = new BulkExportService(this.conversationFinder, this.messageExtractor);

      this.button = null;
      this.bulkButton = null;
      this.dropdown = null;
      this.isBulkExporting = false;
    }

    init() {
      this.createUI();
      this.attachEventListeners();
    }

    createUI() {
      this.button = UIBuilder.createButton();
      this.bulkButton = UIBuilder.createBulkButton();
      this.dropdown = UIBuilder.createDropdown();

      document.body.appendChild(this.button);
      document.body.appendChild(this.bulkButton);
      document.body.appendChild(this.dropdown);

      this.setupFilenameRowToggle();
    }

    setupFilenameRowToggle() {
      const updateFilenameRow = () => {
        const fileRow = this.dropdown.querySelector('#claude-filename-row');
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
      // Single export button
      this.button.addEventListener('click', () => this.showDropdown());

      // Bulk export button
      this.bulkButton.addEventListener('click', () => this.handleBulkExport());

      // Dropdown confirm
      this.dropdown.querySelector('#claude-export-confirm')
        .addEventListener('click', () => this.handleExport());

      // Dropdown cancel
      this.dropdown.querySelector('#claude-export-cancel')
        .addEventListener('click', () => this.hideDropdown());

      // Selection dropdown
      const selectDropdown = this.dropdown.querySelector(`#${CONFIG.SELECT_DROPDOWN_ID}`);
      selectDropdown.addEventListener('change', (e) => {
        const messages = this.messageExtractor.getMessages();
        this.checkboxManager.injectCheckboxes(messages);
        this.selectionManager.applySelection(e.target.value);
      });

      // Click outside to hide dropdown
      document.addEventListener('mousedown', (e) => {
        if (this.dropdown.style.display !== 'none' &&
            !this.dropdown.contains(e.target) &&
            e.target !== this.button) {
          this.hideDropdown();
        }
      });
    }

    showDropdown() {
      const messages = this.messageExtractor.getMessages();
      this.checkboxManager.injectCheckboxes(messages);
      this.dropdown.style.display = '';
    }

    hideDropdown() {
      this.dropdown.style.display = 'none';
      this.checkboxManager.removeAll();
    }

    async handleExport() {
      this.button.disabled = true;
      this.button.textContent = 'Exporting...';
      this.hideDropdown();

      try {
        const exportMode = this.dropdown.querySelector(`input[name="${CONFIG.EXPORT_MODE_NAME}"]:checked`)?.value || 'file';
        const customFilename = exportMode === 'file'
          ? this.dropdown.querySelector(`#${CONFIG.FILENAME_INPUT_ID}`)?.value.trim() || ''
          : '';

        await this.exportService.execute(exportMode, customFilename);
        this.selectionManager.reset();

        const filenameInput = this.dropdown.querySelector(`#${CONFIG.FILENAME_INPUT_ID}`);
        if (filenameInput) filenameInput.value = '';

      } catch (error) {
        console.error('Export error:', error);
        Utils.createNotification(`Export failed: ${error.message}`);
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

      // Check if we need to go to /recents first
      if (!window.location.pathname.includes('/recents')) {
        const goToRecents = confirm(
          'To export ALL conversations, we need to go to the Recents page.\n\n' +
          'Click OK to navigate to claude.ai/recents, then click "Export ALL Chats" again.'
        );

        if (goToRecents) {
          window.location.href = 'https://claude.ai/recents';
        }
        return;
      }

      // Ask what they want to do
      const action = prompt(
        `What would you like to do?\n\n` +
        `1 = Collect all chat URLs (click "Show more" until done, then save URL list)\n` +
        `2 = Export chats from a saved URL list (will prompt for file)\n` +
        `3 = Do both (collect URLs, save them, then export all)\n\n` +
        `Enter 1, 2, or 3:`
      );

      if (!action || !['1', '2', '3'].includes(action.trim())) {
        return;
      }

      const choice = action.trim();

      if (choice === '2') {
        // Load from file and export
        await this.handleExportFromFile();
        return;
      }

      // Choice 1 or 3: Collect URLs first
      this.isBulkExporting = true;
      this.bulkButton.textContent = 'Cancel';
      this.bulkButton.style.background = '#dc3545';
      this.button.style.display = 'none';

      const notification = Utils.createNotification('Loading all conversations...', 0);

      try {
        // Step 1: Load all URLs
        const conversations = await this.conversationFinder.loadAllConversationsFromRecents((msg) => {
          notification.textContent = msg;
        });

        if (!conversations || conversations.length === 0) {
          throw new Error('No conversations found');
        }

        // Save the URL list
        const urlListFilename = this.saveUrlList(conversations);
        notification.textContent = `✓ Saved ${conversations.length} URLs to ${urlListFilename}`;

        if (choice === '1') {
          // Just collecting URLs - we're done
          Utils.createNotification(`✓ Saved ${conversations.length} chat URLs to ${urlListFilename}`, 5000);
          return;
        }

        // Choice 3: Continue with export
        await Utils.sleep(2000);
        notification.textContent = `Starting export of ${conversations.length} conversations...`;

        const results = await this.bulkExportService.exportConversationList(conversations, (msg) => {
          notification.textContent = msg;
        });

        if (results.length > 0) {
          const filename = this.bulkExportService.createBulkExportFile(results);
          const successCount = results.filter(r => !r.error).length;
          Utils.createNotification(
            `✓ Exported ${successCount} conversations to ${filename}`,
            5000
          );
        }

      } catch (error) {
        console.error('Bulk export error:', error);
        Utils.createNotification(`Error: ${error.message}`, 5000);
      } finally {
        this.isBulkExporting = false;
        this.bulkButton.textContent = 'Export ALL Chats';
        this.bulkButton.style.background = CONFIG.STYLES.BULK_PRIMARY;
        this.button.style.display = '';
        if (notification.parentNode) notification.remove();
      }
    }

    saveUrlList(conversations) {
      const timestamp = Utils.getDateString();
      const data = {
        exportedAt: new Date().toISOString(),
        totalCount: conversations.length,
        conversations: conversations
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claude_chat_urls_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      return `claude_chat_urls_${timestamp}.json`;
    }

    async handleExportFromFile() {
      // Create file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';

      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          const text = await file.text();
          const data = JSON.parse(text);

          if (!data.conversations || !Array.isArray(data.conversations)) {
            throw new Error('Invalid file format - missing conversations array');
          }

          const conversations = data.conversations;
          Utils.createNotification(`Loaded ${conversations.length} URLs from file. Starting export...`, 3000);

          this.isBulkExporting = true;
          this.bulkButton.textContent = 'Cancel';
          this.bulkButton.style.background = '#dc3545';
          this.button.style.display = 'none';

          const notification = Utils.createNotification('Starting export...', 0);

          const results = await this.bulkExportService.exportConversationList(conversations, (msg) => {
            notification.textContent = msg;
          });

          if (results.length > 0) {
            const filename = this.bulkExportService.createBulkExportFile(results);
            const successCount = results.filter(r => !r.error).length;
            Utils.createNotification(
              `✓ Exported ${successCount} conversations to ${filename}`,
              5000
            );
          }

          notification.remove();

        } catch (error) {
          console.error('Error loading file:', error);
          Utils.createNotification(`Error: ${error.message}`, 5000);
        } finally {
          this.isBulkExporting = false;
          this.bulkButton.textContent = 'Export ALL Chats';
          this.bulkButton.style.background = CONFIG.STYLES.BULK_PRIMARY;
          this.button.style.display = '';
        }
      };

      fileInput.click();
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const controller = new ExportController();
      controller.init();
    });
  } else {
    const controller = new ExportController();
    controller.init();
  }

})();
