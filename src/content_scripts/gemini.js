/**
 * Gemini Chat Exporter - Gemini content script
 * Exports Gemini chat conversations to Markdown with LaTeX and image preservation
 * Version 4.1.0 - DOM-based extraction with embedded image support
 */

(function() {
  'use strict';

  const CONFIG = {
    BUTTON_ID: 'gemini-export-btn',
    DROPDOWN_ID: 'gemini-export-dropdown',
    FILENAME_INPUT_ID: 'gemini-filename-input',
    SELECT_DROPDOWN_ID: 'gemini-select-dropdown',
    CHECKBOX_CLASS: 'gemini-export-checkbox',
    EXPORT_MODE_NAME: 'gemini-export-mode',
    
    SELECTORS: {
      CHAT_CONTAINER: '[data-test-id="chat-history-container"]',
      CONVERSATION_TURN: 'div.conversation-container',
      USER_QUERY: 'user-query',
      USER_QUERY_TEXT: '.query-text .query-text-line',
      MODEL_RESPONSE: 'model-response',
      MODEL_RESPONSE_CONTENT: 'message-content .markdown',
      CONVERSATION_TITLE: '.conversation-title'
    },
    
    TIMING: {
      SCROLL_DELAY: 2000,
      POPUP_DURATION: 900,
      NOTIFICATION_CLEANUP_DELAY: 1000,
      MAX_SCROLL_ATTEMPTS: 60,
      MAX_STABLE_SCROLLS: 4
    },
    
    STYLES: {
      BUTTON_PRIMARY: '#1a73e8',
      BUTTON_HOVER: '#1765c1',
      DARK_BG: '#111',
      DARK_TEXT: '#fff',
      DARK_BORDER: '#444',
      LIGHT_BG: '#fff',
      LIGHT_TEXT: '#222',
      LIGHT_BORDER: '#ccc'
    },
    
    MATH_BLOCK_SELECTOR: '.math-block[data-math]',
    MATH_INLINE_SELECTOR: '.math-inline[data-math]',
    
    DEFAULT_FILENAME: 'gemini_chat_export',
    MARKDOWN_HEADER: '# Gemini Chat Export',
    EXPORT_TIMESTAMP_FORMAT: 'Exported on:'
  };

  // ============================================================================
  // UTILITY SERVICES
  // ============================================================================
  
  class DateUtils {
    static getDateString() {
      const d = new Date();
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    static getLocaleString() {
      return new Date().toLocaleString();
    }
  }

  class StringUtils {
    static sanitizeFilename(text) {
      return text
        .replace(/[\\/:*?"<>|.]/g, '')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    static removeCitations(text) {
      return text
        .replace(/\[cite_start\]/g, '')
        .replace(/\[cite:[\d,\s]+\]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  // ============================================================================
  // IMAGE UTILITIES
  // ============================================================================
  
  class ImageUtils {
    /**
     * Convert an image element to a base64 data URL
     * Uses background script to bypass CORS for cross-origin images
     * @param {HTMLImageElement} img - The image element to convert
     * @returns {Promise<string>} - Base64 data URL
     */
    static async imageToBase64(img) {
      try {
        const src = img.src;
        
        // If image already has a data URL, return it
        if (src?.startsWith('data:')) {
          return src;
        }

        // If image has a blob URL, fetch and convert it directly
        if (src?.startsWith('blob:')) {
          return await this._blobUrlToBase64(src);
        }

        // For HTTP URLs, use background script to bypass CORS
        if (src?.startsWith('http')) {
          console.log('[Gemini Export] Fetching cross-origin image via background script');
          return await this._fetchViaBackground(src);
        }

        return '';
      } catch (error) {
        console.warn('[Gemini Export] Failed to convert image:', error);
        // On error, return original URL as fallback (will work when online)
        return img.src || '';
      }
    }

    /**
     * Fetch image via background script to bypass CORS
     * @param {string} url - The image URL
     * @returns {Promise<string>} - Base64 data URL
     */
    static async _fetchViaBackground(url) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: 'fetchImageAsBase64', url: url },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[Gemini Export] Background script error:', chrome.runtime.lastError);
              // Fallback to original URL
              resolve(url);
              return;
            }
            
            if (response?.success && response?.data) {
              console.log('[Gemini Export] Successfully fetched image via background');
              resolve(response.data);
            } else {
              console.warn('[Gemini Export] Background fetch failed:', response?.error);
              // Fallback to original URL
              resolve(url);
            }
          }
        );
      });
    }

    /**
     * Convert a blob URL to base64
     */
    static async _blobUrlToBase64(blobUrl) {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    /**
     * Extract alt text from image element
     */
    static getAltText(img) {
      return img.alt || img.title || 'Image';
    }
  }

  class DOMUtils {
    static sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    static isDarkMode() {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    static createNotification(message) {
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
  }

  // ============================================================================
  // FILENAME SERVICE
  // ============================================================================
  
  class FilenameService {
    static getConversationTitle() {
      const titleCard = document.querySelector(CONFIG.SELECTORS.CONVERSATION_TITLE);
      return titleCard ? titleCard.textContent.trim() : '';
    }

    static generate(customFilename, conversationTitle) {
      // Priority: custom > conversation title > page title > timestamp
      if (customFilename && customFilename.trim()) {
        const base = this._sanitizeCustomFilename(customFilename);
        return base || `${CONFIG.DEFAULT_FILENAME}_${DateUtils.getDateString()}`;
      }

      // Try conversation title first
      if (conversationTitle) {
        const safeTitle = StringUtils.sanitizeFilename(conversationTitle);
        if (safeTitle) return `${safeTitle}_${DateUtils.getDateString()}`;
      }

      // Fallback to page title
      const pageTitle = document.querySelector('title')?.textContent.trim();
      if (pageTitle) {
        const safeTitle = StringUtils.sanitizeFilename(pageTitle);
        if (safeTitle) return `${safeTitle}_${DateUtils.getDateString()}`;
      }

      // Final fallback
      return `${CONFIG.DEFAULT_FILENAME}_${DateUtils.getDateString()}`;
    }

    static _sanitizeCustomFilename(filename) {
      let base = filename.trim().replace(/\.[^/.]+$/, '');
      return base.replace(/[^a-zA-Z0-9_\-]/g, '_');
    }
  }

  // ============================================================================
  // SCROLL SERVICE
  // ============================================================================
  
  class ScrollService {
    static async loadAllMessages() {
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
        await DOMUtils.sleep(CONFIG.TIMING.SCROLL_DELAY);
        
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
  }

  // ============================================================================
  // FILE EXPORT SERVICE
  // ============================================================================
  
  class FileExportService {
    static downloadMarkdown(markdown, filenameBase) {
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameBase}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, CONFIG.TIMING.NOTIFICATION_CLEANUP_DELAY);
    }

    static async exportToClipboard(markdown) {
      await navigator.clipboard.writeText(markdown);
      alert('Conversation copied to clipboard!');
    }
  }

  // ============================================================================
  // MARKDOWN CONVERTER SERVICE
  // ============================================================================
  
  class MarkdownConverter {
    constructor() {
      this.turndownService = this._createTurndownService();
    }

    _createTurndownService() {
      if (typeof window.TurndownService !== 'function') {
        return null;
      }

      const service = new window.TurndownService({
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
        strongDelimiter: '**',
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockFence: '```'
      });

      service.addRule('mathBlock', {
        filter: node => node.nodeType === 1 && node.matches?.(CONFIG.MATH_BLOCK_SELECTOR),
        replacement: (content, node) => {
          const latex = node.getAttribute('data-math') || '';
          return `$$${latex}$$\n\n`;
        }
      });

      service.addRule('mathInline', {
        filter: node => node.nodeType === 1 && node.matches?.(CONFIG.MATH_INLINE_SELECTOR),
        replacement: (content, node) => {
          const latex = node.getAttribute('data-math') || '';
          return `$${latex}$`;
        }
      });

      service.addRule('table', {
        filter: 'table',
        replacement: (content, node) => {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return '';

          const getCells = row => {
            return Array.from(row.querySelectorAll('th, td')).map(cell => {
              const cellContent = service.turndown(cell.innerHTML);
              return cellContent.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
            });
          };

          const headerRow = rows[0];
          const headers = getCells(headerRow);
          const separator = headers.map(() => '---');
          const bodyRows = rows.slice(1).map(getCells);

          const lines = [
            `| ${headers.join(' | ')} |`,
            `| ${separator.join(' | ')} |`,
            ...bodyRows.map(cells => `| ${cells.join(' | ')} |`)
          ];

          return `\n${lines.join('\n')}\n\n`;
        }
      });

      service.addRule('lineBreak', {
        filter: 'br',
        replacement: () => '  \n'
      });

      // Image rule - uses placeholder that gets replaced async later
      service.addRule('image', {
        filter: 'img',
        replacement: (content, node) => {
          // Mark images with a placeholder that will be replaced async
          const imgId = `__IMG_PLACEHOLDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}__`;
          // Store the image element reference for later async processing
          if (!this._pendingImages) this._pendingImages = new Map();
          this._pendingImages.set(imgId, node);
          
          const alt = ImageUtils.getAltText(node);
          return `![${alt}](${imgId})`;
        }
      });

      return service;
    }

    /**
     * Process pending images and replace placeholders with base64 data URLs
     * @param {string} markdown - Markdown with image placeholders
     * @returns {Promise<string>} - Markdown with embedded base64 images
     */
    async _processImagePlaceholders(markdown) {
      if (!this._pendingImages || this._pendingImages.size === 0) {
        return markdown;
      }

      let result = markdown;
      
      for (const [placeholder, imgElement] of this._pendingImages.entries()) {
        try {
          const base64Url = await ImageUtils.imageToBase64(imgElement);
          if (base64Url) {
            result = result.replace(placeholder, base64Url);
          } else {
            // Remove the image reference if conversion failed
            result = result.replace(`![${ImageUtils.getAltText(imgElement)}](${placeholder})`, 
              `[Image: ${ImageUtils.getAltText(imgElement)} - could not be exported]`);
          }
        } catch (error) {
          console.warn('Failed to process image:', error);
          result = result.replace(placeholder, ImageUtils._getPlaceholderDataUrl());
        }
      }

      // Clear pending images
      this._pendingImages.clear();
      
      return result;
    }

    async extractUserQuery(userQueryElement) {
      if (!userQueryElement) return '';
      
      // Check for images in user query (uploaded images)
      const images = userQueryElement.querySelectorAll('img');
      let imageMarkdown = '';
      
      if (images.length > 0) {
        for (const img of images) {
          try {
            const base64Url = await ImageUtils.imageToBase64(img);
            const alt = ImageUtils.getAltText(img);
            if (base64Url) {
              imageMarkdown += `![${alt}](${base64Url})\n\n`;
            }
          } catch (error) {
            console.warn('Failed to extract user image:', error);
          }
        }
      }
      
      const queryLines = userQueryElement.querySelectorAll(CONFIG.SELECTORS.USER_QUERY_TEXT);
      let textContent = '';
      
      if (queryLines.length === 0) {
        const queryText = userQueryElement.querySelector('.query-text, .user-query-container');
        textContent = queryText ? queryText.textContent.trim() : '';
      } else {
        textContent = Array.from(queryLines)
          .map(line => line.textContent.trim())
          .filter(text => text.length > 0)
          .join('\n');
      }
      
      // Combine images and text
      return imageMarkdown + textContent;
    }

    async extractModelResponse(modelResponseElement) {
      if (!modelResponseElement) return '';
      
      const markdownContainer = modelResponseElement.querySelector(CONFIG.SELECTORS.MODEL_RESPONSE_CONTENT);
      if (!markdownContainer) return '';

      let result = '';
      if (this.turndownService) {
        result = this.turndownService.turndown(markdownContainer.innerHTML);
        // Process any pending image placeholders
        result = await this._processImagePlaceholders(result);
      } else {
        result = await FallbackConverter.convertToMarkdown(markdownContainer);
      }
      
      // Remove Gemini citation markers
      return StringUtils.removeCitations(result);
    }
  }

  // ============================================================================
  // FALLBACK CONVERTER (when Turndown unavailable)
  // ============================================================================
  
  class FallbackConverter {
    static async convertToMarkdown(container) {
      const results = [];
      for (const node of container.childNodes) {
        results.push(await this._blockText(node));
      }
      return results.join('');
    }

    static async _inlineText(node) {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';

      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node;
      if (el.matches?.(CONFIG.MATH_INLINE_SELECTOR)) {
        const latex = el.getAttribute('data-math') || '';
        return `$${latex}$`;
      }

      const tag = el.tagName.toLowerCase();
      if (tag === 'br') return '\n';
      
      // Handle inline images
      if (tag === 'img') {
        try {
          const base64Url = await ImageUtils.imageToBase64(el);
          const alt = ImageUtils.getAltText(el);
          return base64Url ? `![${alt}](${base64Url})` : `[Image: ${alt}]`;
        } catch (error) {
          return `[Image: ${ImageUtils.getAltText(el)}]`;
        }
      }
      
      if (tag === 'b' || tag === 'strong') {
        const childResults = [];
        for (const n of el.childNodes) {
          childResults.push(await this._inlineText(n));
        }
        return `**${childResults.join('')}**`;
      }
      if (tag === 'i' || tag === 'em') {
        const childResults = [];
        for (const n of el.childNodes) {
          childResults.push(await this._inlineText(n));
        }
        return `*${childResults.join('')}*`;
      }
      if (tag === 'code') {
        return `\`${el.textContent || ''}\``;
      }

      const childResults = [];
      for (const n of el.childNodes) {
        childResults.push(await this._inlineText(n));
      }
      return childResults.join('');
    }

    static async _blockText(el) {
      if (!el) return '';

      if (el.nodeType === Node.TEXT_NODE) {
        return (el.textContent || '').trim();
      }

      if (el.nodeType !== Node.ELEMENT_NODE) return '';

      const tag = el.tagName.toLowerCase();

      if (el.matches?.(CONFIG.MATH_BLOCK_SELECTOR)) {
        const latex = el.getAttribute('data-math') || '';
        return `$$${latex}$$\n\n`;
      }
      
      // Handle block-level images
      if (tag === 'img') {
        try {
          const base64Url = await ImageUtils.imageToBase64(el);
          const alt = ImageUtils.getAltText(el);
          return base64Url ? `![${alt}](${base64Url})\n\n` : `[Image: ${alt}]\n\n`;
        } catch (error) {
          return `[Image: ${ImageUtils.getAltText(el)}]\n\n`;
        }
      }

      const handlers = {
        h1: async () => `# ${await this._inlineText(el)}\n\n`,
        h2: async () => `## ${await this._inlineText(el)}\n\n`,
        h3: async () => `### ${await this._inlineText(el)}\n\n`,
        h4: async () => `#### ${await this._inlineText(el)}\n\n`,
        h5: async () => `##### ${await this._inlineText(el)}\n\n`,
        h6: async () => `###### ${await this._inlineText(el)}\n\n`,
        p: async () => `${await this._inlineText(el)}\n\n`,
        hr: async () => `---\n\n`,
        blockquote: async () => await this._convertBlockquote(el),
        pre: async () => `\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`,
        ul: async () => await this._convertList(el, false),
        ol: async () => await this._convertList(el, true),
        table: async () => await this._convertTable(el)
      };

      if (handlers[tag]) {
        return await handlers[tag]();
      }

      // Default: process child nodes
      const childResults = [];
      for (const n of el.childNodes) {
        childResults.push(await this._blockText(n));
      }
      return childResults.join('');
    }

    static async _convertBlockquote(el) {
      const childResults = [];
      for (const n of el.childNodes) {
        childResults.push(await this._blockText(n));
      }
      const lines = childResults.join('').trim().split('\n');
      return lines.map(line => line ? `> ${line}` : '>').join('\n') + '\n\n';
    }

    static async _convertList(el, isOrdered) {
      const items = Array.from(el.querySelectorAll(':scope > li'));
      const converted = [];
      for (let i = 0; i < items.length; i++) {
        const li = items[i];
        const marker = isOrdered ? `${i + 1}.` : '-';
        const text = await this._inlineText(li);
        converted.push(`${marker} ${text.trim()}`);
      }
      return `${converted.join('\n')}\n\n`;
    }

    static async _convertTable(el) {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (!rows.length) return '';
      
      const getCells = async (row) => {
        const cells = [];
        for (const cell of row.querySelectorAll('th,td')) {
          const text = await this._inlineText(cell);
          cells.push(text.replace(/\n/g, ' ').trim());
        }
        return cells;
      };
      
      const header = await getCells(rows[0]);
      const separator = header.map(() => '---');
      const body = [];
      for (const row of rows.slice(1)) {
        body.push(await getCells(row));
      }
      
      const lines = [
        `| ${header.join(' | ')} |`,
        `| ${separator.join(' | ')} |`,
        ...body.map(r => `| ${r.join(' | ')} |`)
      ];
      return `${lines.join('\n')}\n\n`;
    }
  }

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
      const isDark = DOMUtils.isDarkMode();
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

    static createDropdown() {
      const dropdown = document.createElement('div');
      dropdown.id = CONFIG.DROPDOWN_ID;
      
      const isDark = DOMUtils.isDarkMode();
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

  function tableToMarkdown(table, service) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';

    const toCells = row => Array.from(row.querySelectorAll('th,td'))
      .map(cell => service.turndown(cell.innerHTML).replace(/\n+/g, ' ').trim());

    const header = toCells(rows[0]);
    const separator = header.map(() => '---');
    const body = rows.slice(1).map(toCells);

    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${separator.join(' | ')} |`,
      ...body.map(r => `| ${r.join(' | ')} |`)
    ];

    return `${lines.join('\n')}\n\n`;
  }

  function inlineText(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node;
    if (el.matches(CONFIG.MATH_INLINE_SELECTOR)) {
      const latex = el.getAttribute('data-math') || '';
      return `$${latex}$`;
    }

    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '\n';
    if (tag === 'b' || tag === 'strong') {
      return `**${Array.from(el.childNodes).map(inlineText).join('')}**`;
    }
    if (tag === 'i' || tag === 'em') {
      return `*${Array.from(el.childNodes).map(inlineText).join('')}*`;
    }
    if (tag === 'code') {
      return `\`${el.textContent || ''}\``;
    }

    return Array.from(el.childNodes).map(inlineText).join('');
  }

  function blockText(el) {
    if (!el) return '';

    if (el.nodeType === Node.TEXT_NODE) {
      return (el.textContent || '').trim();
    }

    if (el.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = el.tagName.toLowerCase();

    if (el.matches(CONFIG.MATH_BLOCK_SELECTOR)) {
      const latex = el.getAttribute('data-math') || '';
      return `$$${latex}$$\n\n`;
    }

    switch (tag) {
      case 'h1': return `# ${inlineText(el)}\n\n`;
      case 'h2': return `## ${inlineText(el)}\n\n`;
      case 'h3': return `### ${inlineText(el)}\n\n`;
      case 'h4': return `#### ${inlineText(el)}\n\n`;
      case 'h5': return `##### ${inlineText(el)}\n\n`;
      case 'h6': return `###### ${inlineText(el)}\n\n`;
      case 'p': return `${inlineText(el)}\n\n`;
      case 'hr': return `---\n\n`;
      case 'blockquote': {
        const lines = Array.from(el.childNodes).map(blockText).join('').trim().split('\n');
        return lines.map(line => line ? `> ${line}` : '>').join('\n') + '\n\n';
      }
      case 'pre': {
        const code = el.textContent || '';
        return `\
\
\
${code}\n\
\
\n`;
      }
      case 'ul': {
        const items = Array.from(el.querySelectorAll(':scope > li'))
          .map(li => `- ${inlineText(li).trim()}`)
          .join('\n');
        return `${items}\n\n`;
      }
      case 'ol': {
        const items = Array.from(el.querySelectorAll(':scope > li'))
          .map((li, i) => `${i + 1}. ${inlineText(li).trim()}`)
          .join('\n');
        return `${items}\n\n`;
      }
      case 'table': {
        const rows = Array.from(el.querySelectorAll('tr'));
        if (!rows.length) return '';
        const cells = row => Array.from(row.querySelectorAll('th,td'))
          .map(cell => inlineText(cell).replace(/\n/g, ' ').trim());
        const header = cells(rows[0]);
        const sep = header.map(() => '---');
        const body = rows.slice(1).map(r => cells(r));
        const lines = [
          `| ${header.join(' | ')} |`,
          `| ${sep.join(' | ')} |`,
          ...body.map(r => `| ${r.join(' | ')} |`)
        ];
        return `${lines.join('\n')}\n\n`;
      }
      case 'div':
      case 'section':
      case 'article':
      default: {
        return Array.from(el.childNodes).map(blockText).join('');
      }
    }
  }

  // ============================================================================
  // EXPORT SERVICE
  // ============================================================================
  class ExportService {
    constructor(checkboxManager) {
      this.checkboxManager = checkboxManager;
      this.markdownConverter = new MarkdownConverter();
    }

    _buildMarkdownHeader(conversationTitle) {
      const title = conversationTitle || CONFIG.MARKDOWN_HEADER;
      const timestamp = DateUtils.getLocaleString();
      return `# ${title}\n\n> ${CONFIG.EXPORT_TIMESTAMP_FORMAT} ${timestamp}\n\n---\n\n`;
    }

    async buildMarkdown(turns, conversationTitle) {
      let markdown = this._buildMarkdownHeader(conversationTitle);

      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        DOMUtils.createNotification(`Processing message ${i + 1} of ${turns.length}...`);

        // User message
        const userQueryElem = turn.querySelector(CONFIG.SELECTORS.USER_QUERY);
        if (userQueryElem) {
          const cb = userQueryElem.querySelector(`.${CONFIG.CHECKBOX_CLASS}`);
          if (cb?.checked) {
            const userQuery = await this.markdownConverter.extractUserQuery(userQueryElem);
            if (userQuery) {
              markdown += `## 👤 You\n\n${userQuery}\n\n`;
            }
          }
        }

        // Model response (DOM-based extraction)
        const modelRespElem = turn.querySelector(CONFIG.SELECTORS.MODEL_RESPONSE);
        if (modelRespElem) {
          const cb = modelRespElem.querySelector(`.${CONFIG.CHECKBOX_CLASS}`);
          if (cb?.checked) {
            const modelResponse = await this.markdownConverter.extractModelResponse(modelRespElem);
            if (modelResponse) {
              markdown += `## 🤖 Gemini\n\n${modelResponse}\n\n`;
            } else {
              markdown += `## 🤖 Gemini\n\n[Note: Could not extract model response from message ${i + 1}.]\n\n`;
            }
          }
        }

        markdown += '---\n\n';
      }

      return markdown;
    }

    async execute(exportMode, customFilename) {
      try {
        // Load all messages
        await ScrollService.loadAllMessages();

        // Get all turns and inject checkboxes
        const turns = Array.from(document.querySelectorAll(CONFIG.SELECTORS.CONVERSATION_TURN));
        this.checkboxManager.injectCheckboxes();

        // Check if any messages selected
        if (!this.checkboxManager.hasAnyChecked()) {
          alert('Please select at least one message to export using the checkboxes or the dropdown.');
          return;
        }

        // Get title and build markdown
        const conversationTitle = FilenameService.getConversationTitle();
        const markdown = await this.buildMarkdown(turns, conversationTitle);

        // Export based on mode
        if (exportMode === 'clipboard') {
          await FileExportService.exportToClipboard(markdown);
        } else {
          const filename = FilenameService.generate(customFilename, conversationTitle);
          FileExportService.downloadMarkdown(markdown, filename);
        }

      } catch (error) {
        console.error('Export error:', error);
        alert(`Export failed: ${error.message}`);
      }
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
      this.button = null;
      this.dropdown = null;
    }

    init() {
      this.createUI();
      this.attachEventListeners();
      this.observeStorageChanges();
    }

    createUI() {
      this.button = UIBuilder.createButton();
      this.dropdown = UIBuilder.createDropdown();
      
      document.body.appendChild(this.dropdown);
      document.body.appendChild(this.button);
      
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
