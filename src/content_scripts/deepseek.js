/**
 * DeepSeek Chat Exporter - Content script for chat.deepseek.com
 * Exports DeepSeek chat conversations to Markdown (same UX as Gemini exporter)
 * DOM: .ds-markdown (AI content), .ds-markdown-paragraph, .md-code-block, etc.
 */

(function() {
  'use strict';

  const CONFIG = {
    BUTTON_ID: 'deepseek-export-btn',
    DROPDOWN_ID: 'deepseek-export-dropdown',
    FILENAME_INPUT_ID: 'deepseek-filename-input',
    SELECT_DROPDOWN_ID: 'deepseek-select-dropdown',
    CHECKBOX_CLASS: 'deepseek-export-checkbox',
    EXPORT_MODE_NAME: 'deepseek-export-mode',

    SELECTORS: {
      CHAT_CONTAINER: 'main [class*="scroll"], main [class*="chat"], [class*="conversation"] [class*="scroll"], [class*="message-list"]',
      DS_MARKDOWN: '.ds-markdown',
      // 用户发送的消息（sample.html 中用户问题在 .ds-message 内，且该条不包含 .ds-markdown）
      DS_MESSAGE: '.ds-message',
      CONVERSATION_TITLE: 'h1, [class*="title"], [class*="Title"]'
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

    DEFAULT_FILENAME: 'deepseek_chat_export',
    MARKDOWN_HEADER: '# DeepSeek Chat Export',
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
    /** 仅移除非法文件名字符，保留中文等 Unicode */
    static sanitizeFilename(text) {
      if (!text || typeof text !== 'string') return '';
      return text
        .replace(/[\\/:*?"<>|\0]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+|\.+$/g, '') || '';
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
      const sel = CONFIG.SELECTORS.CONVERSATION_TITLE;
      const el = document.querySelector(sel);
      return el ? el.textContent.trim() : '';
    }
    static generate(customFilename, conversationTitle) {
      if (customFilename && customFilename.trim()) {
        const base = StringUtils.sanitizeFilename(customFilename.trim().replace(/\.[^/.]+$/, ''));
        return base || `${CONFIG.DEFAULT_FILENAME}_${DateUtils.getDateString()}`;
      }
      if (conversationTitle) {
        const safe = StringUtils.sanitizeFilename(conversationTitle);
        if (safe) return `${safe}_${DateUtils.getDateString()}`;
      }
      const pageTitle = document.querySelector('title')?.textContent.trim();
      if (pageTitle) {
        const safe = StringUtils.sanitizeFilename(pageTitle);
        if (safe) return `${safe}_${DateUtils.getDateString()}`;
      }
      return `${CONFIG.DEFAULT_FILENAME}_${DateUtils.getDateString()}`;
    }
  }

  // ============================================================================
  // SCROLL SERVICE
  // ============================================================================

  class ScrollService {
    static async loadAllMessages() {
      const container = document.querySelector(CONFIG.SELECTORS.CHAT_CONTAINER);
      if (!container) return;

      let stableScrolls = 0;
      let scrollAttempts = 0;
      let lastScrollTop = null;
      const countTurns = () => document.querySelectorAll(CONFIG.SELECTORS.DS_MARKDOWN).length;

      while (stableScrolls < CONFIG.TIMING.MAX_STABLE_SCROLLS && scrollAttempts < CONFIG.TIMING.MAX_SCROLL_ATTEMPTS) {
        const current = countTurns();
        container.scrollTop = 0;
        await DOMUtils.sleep(CONFIG.TIMING.SCROLL_DELAY);
        const next = countTurns();
        if (next === current && (lastScrollTop === container.scrollTop || container.scrollTop === 0)) {
          stableScrolls++;
        } else {
          stableScrolls = 0;
        }
        lastScrollTop = container.scrollTop;
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
  // DEEPSEEK MARKDOWN CONVERTER (.ds-markdown DOM → Markdown)
  // ============================================================================

  /** 从 KaTeX 节点中取出原始 LaTeX（.katex-mathml 内 annotation[encoding="application/x-tex"]） */
  function getKatexLatex(container) {
    if (!container || typeof container.querySelector !== 'function') return '';
    const katexEl = container.classList?.contains('katex') ? container : container.querySelector('.katex');
    if (!katexEl) return '';
    const ann = katexEl.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
    return ann ? (ann.textContent || '').trim() : '';
  }

  /** 是否为块级公式（使用 $$...$$ 导出） */
  function isKatexDisplay(container) {
    if (!container || typeof container.querySelector !== 'function') return false;
    const katexEl = container.classList?.contains('katex') ? container : container.querySelector('.katex');
    return !!katexEl?.classList?.contains('katex-display');
  }

  /** 判断节点是否为 KaTeX 公式节点（或公式片段），用于合并「一行一个字母」的公式 */
  function isKatexOrFormulaFragment(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node;
    if (el.classList?.contains('katex') || el.classList?.contains('katex-display')) return true;
    if (el.classList?.contains('ds-markdown-paragraph') && el.tagName === 'P') {
      const hasKatex = el.querySelector('.katex');
      const textLen = (el.textContent || '').trim().length;
      return !!hasKatex && textLen <= 30;
    }
    if (el.tagName === 'DIV' || el.tagName === 'SPAN') {
      const onlyKatex = el.querySelector('.katex') && !el.querySelector(':not(.katex):not([class^="katex-"])');
      if (onlyKatex || el.classList?.contains('katex')) return true;
    }
    return false;
  }

  class DeepSeekMarkdownConverter {
    /** 从 .ds-markdown 根开始转为 Markdown；连续公式片段会合并为一行 */
    dsMarkdownToMarkdown(root) {
      if (!root || !root.matches?.('.ds-markdown')) return '';
      const nodes = Array.from(root.childNodes);
      const parts = [];
      let i = 0;
      while (i < nodes.length) {
        const node = nodes[i];
        if (node.nodeType === Node.ELEMENT_NODE && isKatexOrFormulaFragment(node)) {
          let run = '';
          while (i < nodes.length) {
            const n = nodes[i];
            if (n.nodeType !== Node.ELEMENT_NODE || !isKatexOrFormulaFragment(n)) break;
            const part = this._blockInlineOnly(n);
            const isDisplayPart = part.startsWith('$$') && part.endsWith('$$') && part.length > 4;
            if (run) run += isDisplayPart ? '\n\n' : ' ';
            run += part;
            i++;
          }
          if (run.trim()) parts.push(run.trim() + '\n\n');
        } else {
          parts.push(this._block(node));
          i++;
        }
      }
      return parts.join('');
    }

    /** 仅输出内联内容，不追加段落换行（用于公式片段合并）；优先输出 LaTeX 的 $...$ / $$...$$ */
    _blockInlineOnly(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node;
      /* 段落内常有「文字 + 公式 + 文字」（如：对于位置 $i$ 的token：），必须用 _inline 保留全文，不能只取第一个公式 */
      if (el.classList?.contains('ds-markdown-paragraph') && el.tagName === 'P')
        return this._inline(el).trim();
      const latex = getKatexLatex(el);
      if (latex) {
        return isKatexDisplay(el) ? `$$${latex}$$` : `$${latex}$`;
      }
      if (el.classList?.contains('katex') || el.classList?.contains('katex-display'))
        return this._inline(el);
      return this._inline(el);
    }

    _inline(node) {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').replace(/\s+/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node;
      /* 段落内嵌的 KaTeX：优先导出 LaTeX 为 $...$ / $$...$$，便于博客等正确渲染 */
      if (el.classList?.contains('katex') || el.classList?.contains('katex-display')) {
        const latex = getKatexLatex(el);
        if (latex) return isKatexDisplay(el) ? `$$${latex}$$` : `$${latex}$`;
      }
      const tag = el.tagName.toLowerCase();
      if (tag === 'br') return '\n';
      if (tag === 'b' || tag === 'strong') return `**${Array.from(el.childNodes).map(n => this._inline(n)).join('')}**`;
      if (tag === 'i' || tag === 'em') return `*${Array.from(el.childNodes).map(n => this._inline(n)).join('')}*`;
      if (tag === 'code') return `\`${(el.textContent || '').replace(/`/g, '\\`')}\``;
      if (tag === 'span') return Array.from(el.childNodes).map(n => this._inline(n)).join('');
      return Array.from(el.childNodes).map(n => this._inline(n)).join('');
    }

    _block(node) {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return (node.textContent || '').trim() ? node.textContent.trim() + '\n\n' : '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const el = node;
      const tag = el.tagName.toLowerCase();

      if (el.classList?.contains('ds-markdown-paragraph') || tag === 'p') {
        return `${this._inline(el).trim()}\n\n`;
      }
      if (tag === 'h1') return `# ${this._inline(el)}\n\n`;
      if (tag === 'h2') return `## ${this._inline(el)}\n\n`;
      if (tag === 'h3') return `### ${this._inline(el)}\n\n`;
      if (tag === 'h4') return `#### ${this._inline(el)}\n\n`;
      if (tag === 'h5') return `##### ${this._inline(el)}\n\n`;
      if (tag === 'h6') return `###### ${this._inline(el)}\n\n`;
      if (tag === 'hr') return '---\n\n';

      if (el.classList?.contains('md-code-block') || el.classList?.contains('md-code-block-dark')) {
        const pre = el.querySelector('pre');
        const code = pre ? pre.textContent || '' : el.textContent || '';
        const lang = el.querySelector('.d813de27')?.textContent?.trim() || '';
        const fence = lang ? `\n\`\`\`${lang}\n${code}\n\`\`\`\n\n` : `\n\`\`\`\n${code}\n\`\`\`\n\n`;
        return fence;
      }
      if (tag === 'pre') {
        const code = el.textContent || '';
        return `\n\`\`\`\n${code}\n\`\`\`\n\n`;
      }

      if (tag === 'ul') {
        const items = Array.from(el.querySelectorAll(':scope > li')).map(li => `- ${this._inline(li).trim()}`);
        return `${items.join('\n')}\n\n`;
      }
      if (tag === 'ol') {
        const items = Array.from(el.querySelectorAll(':scope > li')).map((li, i) => `${i + 1}. ${this._inline(li).trim()}`);
        return `${items.join('\n')}\n\n`;
      }
      if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr'));
        if (!rows.length) return '';
        const cells = row => Array.from(row.querySelectorAll('th, td')).map(cell => this._inline(cell).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim());
        const header = cells(rows[0]);
        const sep = header.map(() => '---');
        const body = rows.slice(1).map(cells);
        const lines = [`| ${header.join(' | ')} |`, `| ${sep.join(' | ')} |`, ...body.map(r => `| ${r.join(' | ')} |`)];
        return `\n${lines.join('\n')}\n\n`;
      }
      if (tag === 'blockquote') {
        const inner = Array.from(el.childNodes).map(n => this._block(n)).join('').trim().split('\n');
        return inner.map(line => `> ${line}`).join('\n') + '\n\n';
      }

      /* 块级 KaTeX：优先导出 LaTeX 为 $...$ / $$...$$，便于博客等正确渲染 */
      if (el.classList?.contains('katex') || el.classList?.contains('katex-display')) {
        const latex = getKatexLatex(el);
        if (latex) return (isKatexDisplay(el) ? `$$${latex}$$` : `$${latex}$`) + '\n\n';
        return this._inline(el).trim() + '\n\n';
      }
      /* 处于 KaTeX 内的节点只输出内联，避免公式被拆成「一行一个字母」 */
      if (el.closest?.('.katex')) {
        return this._inline(el);
      }
      if (tag === 'div' || tag === 'section') {
        return Array.from(el.childNodes).map(n => this._block(n)).join('');
      }
      return Array.from(el.childNodes).map(n => this._block(n)).join('');
    }
  }

  // ============================================================================
  // EXTRACTION (.ds-markdown → Markdown)
  // ============================================================================

  class MarkdownConverter {
    constructor() {
      this.dsConverter = new DeepSeekMarkdownConverter();
    }

    extractBlock(dsMarkdownEl) {
      if (!dsMarkdownEl || !dsMarkdownEl.matches?.('.ds-markdown')) return '';
      return this.dsConverter.dsMarkdownToMarkdown(dsMarkdownEl).replace(/\n{3,}/g, '\n\n').trim();
    }

    extractUserMessage(el) {
      return el ? (el.textContent || '').trim() : '';
    }
  }

  // ============================================================================
  // COLLECT TURNS：用户 .ds-message + 助手每个 .ds-markdown 各一条，按文档顺序合并（不合并助手块，保证内容不少）
  // ============================================================================

  function collectTurns() {
    const userCandidates = document.querySelectorAll(CONFIG.SELECTORS.DS_MESSAGE);
    const userEls = Array.from(userCandidates).filter(el => !el.querySelector(CONFIG.SELECTORS.DS_MARKDOWN));
    const assistantNodes = document.querySelectorAll(CONFIG.SELECTORS.DS_MARKDOWN);

    const all = [];
    userEls.forEach(el => all.push({ type: 'user', el }));
    assistantNodes.forEach(el => all.push({ type: 'assistant', el }));
    // 按 DOM 文档顺序：若 a 在 b 前面则 a 应排在数组前面（返回负数）
    all.sort((a, b) => {
      if (a.el === b.el) return 0;
      const aBeforeB = (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return aBeforeB ? -1 : 1;
    });
    return all;
  }

  // ============================================================================
  // CHECKBOX MANAGER
  // ============================================================================

  class CheckboxManager {
    createCheckbox(container, label) {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = CONFIG.CHECKBOX_CLASS;
      cb.checked = true;
      cb.title = label || 'Include in export';
      Object.assign(cb.style, {
        position: 'absolute',
        right: '28px',
        top: '8px',
        zIndex: '10000',
        transform: 'scale(1.2)'
      });
      if (container.style.position !== 'relative') container.style.position = 'relative';
      container.appendChild(cb);
      return cb;
    }

    injectCheckboxes(turns) {
      turns.forEach(({ type, el }) => {
        if (el && !el.querySelector(`.${CONFIG.CHECKBOX_CLASS}`)) {
          this.createCheckbox(el, type === 'user' ? 'Include this user message' : 'Include this DeepSeek message');
        }
      });
    }

    removeAll() {
      document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}`).forEach(cb => cb.remove());
    }

    hasAnyChecked() {
      return Array.from(document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}`)).some(cb => cb.checked);
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
    applySelection(value, turns) {
      const checkboxes = document.querySelectorAll(`.${CONFIG.CHECKBOX_CLASS}`);
      switch (value) {
        case 'all':
          checkboxes.forEach(cb => cb.checked = true);
          break;
        case 'ai':
          (turns || []).forEach(({ type, el }) => {
            const cb = el?.querySelector(`.${CONFIG.CHECKBOX_CLASS}`);
            if (cb) cb.checked = type === 'assistant';
          });
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
        <div id="deepseek-filename-row" style="margin-top:10px;display:block;">
          <label for="${CONFIG.FILENAME_INPUT_ID}" style="font-weight:bold;">
            Filename <span style='color:#888;font-weight:normal;'>(optional)</span>:
          </label>
          <input id="${CONFIG.FILENAME_INPUT_ID}" type="text"
                 style="margin-left:8px;padding:2px 8px;width:260px;${inputStyles}"
                 value="">
          <span style="display:block;font-size:0.95em;color:#888;margin-top:2px;">
            Optional. Leave blank to use chat title or timestamp. Only <b>.md</b> (Markdown) files are supported.
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
      return `# ${title}\n\n> ${CONFIG.EXPORT_TIMESTAMP_FORMAT} ${DateUtils.getLocaleString()}\n\n---\n\n`;
    }

    async buildMarkdown(turns, conversationTitle) {
      let markdown = this._buildMarkdownHeader(conversationTitle);

      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const el = turn.el;
        DOMUtils.createNotification(`Processing message ${i + 1} of ${turns.length}...`);

        const cb = el.querySelector(`.${CONFIG.CHECKBOX_CLASS}`);
        if (!cb?.checked) continue;

        if (turn.type === 'user') {
          const text = this.markdownConverter.extractUserMessage(el);
          if (text) markdown += `## 👤 You\n\n${text}\n\n---\n\n`;
        } else {
          const text = this.markdownConverter.extractBlock(el);
          markdown += `## 🤖 DeepSeek\n\n${text || '[No content extracted.]'}\n\n---\n\n`;
        }
      }
      return markdown;
    }

    async execute(exportMode, customFilename) {
      try {
        await ScrollService.loadAllMessages();
        const turns = collectTurns();
        if (!turns.length) {
          alert('No messages found. Make sure you are on a DeepSeek chat page with messages.');
          return;
        }

        this.checkboxManager.injectCheckboxes(turns);
        if (!this.checkboxManager.hasAnyChecked()) {
          alert('Please select at least one message to export (checkboxes or dropdown).');
          return;
        }

        const conversationTitle = FilenameService.getConversationTitle();
        const markdown = await this.buildMarkdown(turns, conversationTitle);

        if (exportMode === 'clipboard') {
          await FileExportService.exportToClipboard(markdown);
        } else {
          const filename = FilenameService.generate(customFilename, conversationTitle);
          FileExportService.downloadMarkdown(markdown, filename);
        }
      } catch (error) {
        console.error('DeepSeek export error:', error);
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
      const update = () => {
        const fileRow = this.dropdown.querySelector('#deepseek-filename-row');
        const fileRadio = this.dropdown.querySelector(`input[name="${CONFIG.EXPORT_MODE_NAME}"][value="file"]`);
        if (fileRow && fileRadio) fileRow.style.display = fileRadio.checked ? 'block' : 'none';
      };
      this.dropdown.querySelectorAll(`input[name="${CONFIG.EXPORT_MODE_NAME}"]`).forEach(r => r.addEventListener('change', update));
      update();
    }

    attachEventListeners() {
      this.button.addEventListener('click', () => this.handleButtonClick());

      const selectDropdown = this.dropdown.querySelector(`#${CONFIG.SELECT_DROPDOWN_ID}`);
      if (selectDropdown) {
        selectDropdown.addEventListener('change', (e) => {
          const turns = collectTurns();
          this.checkboxManager.removeAll();
          this.checkboxManager.injectCheckboxes(turns);
          this.selectionManager.applySelection(e.target.value, turns);
        });
      }

      document.addEventListener('change', (e) => {
        if (e.target?.classList?.contains(CONFIG.CHECKBOX_CLASS)) {
          const select = document.getElementById(CONFIG.SELECT_DROPDOWN_ID);
          if (select && select.value !== 'custom') {
            select.value = 'custom';
            this.selectionManager.lastSelection = 'custom';
          }
        }
      });

      document.addEventListener('mousedown', (e) => {
        if (this.dropdown.style.display !== 'none' && !this.dropdown.contains(e.target) && e.target !== this.button) {
          this.dropdown.style.display = 'none';
        }
      });
    }

    async handleButtonClick() {
      const turns = collectTurns();
      this.checkboxManager.removeAll();
      this.checkboxManager.injectCheckboxes(turns);

      if (this.dropdown.style.display === 'none') {
        this.dropdown.style.display = '';
        return;
      }

      this.button.disabled = true;
      this.button.textContent = 'Exporting...';

      try {
        const exportMode = this.dropdown.querySelector(`input[name="${CONFIG.EXPORT_MODE_NAME}"]:checked`)?.value || 'file';
        const customFilename = exportMode === 'file'
          ? (this.dropdown.querySelector(`#${CONFIG.FILENAME_INPUT_ID}`)?.value?.trim() || '')
          : '';

        this.dropdown.style.display = 'none';
        await this.exportService.execute(exportMode, customFilename);

        this.checkboxManager.removeAll();
        this.selectionManager.reset();
        const filenameInput = this.dropdown.querySelector(`#${CONFIG.FILENAME_INPUT_ID}`);
        if (filenameInput) filenameInput.value = '';
      } catch (error) {
        console.error('DeepSeek export error:', error);
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
          if (area === 'sync' && 'hideExportBtn' in changes) updateVisibility();
        });
      }
    }
  }

  const controller = new ExportController();
  controller.init();
})();
