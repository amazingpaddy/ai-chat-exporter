# AI Chat Exporter

Export your Gemini and ChatGPT conversations to perfectly formatted Markdown files with complete preservation of LaTeX math, code blocks, tables, images, and all formatting. Version 4.1.0 introduces embedded image support for Gemini exports—your images are now included as base64 data URLs for fully self-contained exports.

## Features

- **DOM-based extraction for Gemini (v4.0.0+)**: Direct HTML parsing without clipboard dependency using Turndown library
- **Image export (v4.1.0+)**: User-uploaded and AI-generated images are embedded as base64 data URLs
- Export your full Gemini or ChatGPT chat conversation to Markdown, preserving formatting (code, tables, LaTeX, etc.)
- Dedicated "Export Chat" button appears automatically on every Gemini and ChatGPT chat page
- Option to hide the export button via the extension popup
- **Granular message selection**: Use checkboxes next to each message to select exactly what to export
- **Selection presets**: Instantly select all, none, or only AI responses with a dropdown
- **Export to clipboard or file**: Copy your chat as Markdown directly to your clipboard—no file download needed, or save as .md file
- **Custom filename (optional)**: Enter a filename, or leave blank to use the chat title or a timestamp
- **Automatic lazy-loading**: Scrolls to load all messages in long conversations before export
- **Citation removal**: Automatically strips Gemini citation markers from exported content
- **Math formula support**: Preserves LaTeX equations from Gemini's `data-math` attributes
- Dark mode support: Export controls display correctly in both light and dark themes
- No build step required
- Open source under the Apache License 2.0

## Installation

1. **Download the latest release**
   - Go to the [Releases](https://github.com/amazingpaddy/gemini-chat-exporter/releases) page
   - Download the `gemini-chat-exporter.zip` file from the latest release
   - Unzip the file to a folder on your computer

2. **Load the extension in Chrome**
   - Open `chrome://extensions` in your Chrome browser
   - Enable "Developer mode" (toggle in the top right)
   - Click "Load unpacked" and select the folder where you unzipped the extension files

3. **You're done!**
   - The "Export Chat" button will now appear on every Gemini and ChatGPT chat page

Support for other LLMs like DeepSeek, Claude, and Grok will be added in future updates.

## What's New in v4.1.0

### 🖼️ Image Export Support for Gemini
- **Fully embedded images**: Both user-uploaded and AI-generated images are embedded as base64
- **Self-contained exports**: Markdown files work offline—no external dependencies
- **Background script fetching**: Bypasses CORS restrictions for Google-hosted images
- **Graceful fallback**: If embedding fails, original URL is preserved

### Technical Details
- Blob URLs (user uploads) are converted directly to base64
- HTTP URLs (Google's servers) are fetched via background service worker to bypass CORS
- Both Turndown-based and fallback converter handle images asynchronously
- New `host_permissions` added for `*.googleusercontent.com`

## What's New in v4.0.0

### 🎉 DOM-Based Extraction for Gemini
- **No more clipboard dependency**: Gemini exports now use direct DOM parsing with the Turndown library
- **More reliable**: Eliminates clipboard race conditions and retry logic
- **Better formatting**: Direct HTML-to-Markdown conversion preserves complex formatting
- **Math formula support**: Extracts LaTeX equations from Gemini's `data-math` attributes
- **Enhanced privacy**: Clipboard access no longer required for Gemini

### Technical Improvements
- Integrated [Turndown.js](https://github.com/mixmark-io/turndown) for robust HTML→Markdown conversion
- Custom Turndown rules for math blocks, inline math, and tables
- Improved citation removal algorithm
- Fallback to manual DOM traversal if Turndown unavailable

### Migration Notes
- Old clipboard-based implementation preserved as `gemini_old.js`
- ChatGPT export unchanged (still uses clipboard method)
- All UI features maintained (checkboxes, selection presets, custom filenames)

## Usage

### Gemini
1. Go to [Gemini](https://gemini.google.com/) and open any chat conversation.
2. Click the **Export Chat** button at the top right of the page.
3. In the export menu, use the **Select messages** dropdown to quickly select "All", "Only answers" (AI responses), or "None". You can also manually check/uncheck any message using the checkboxes on the right of each message. If you make a custom selection, the dropdown will show "Custom".
4. Choose your export mode:
   - **Export as file** (default): Downloads a Markdown (.md) file
   - **Export to clipboard**: Copies the conversation to your clipboard for pasting elsewhere
5. **(Optional)** Enter a custom filename, or leave blank to automatically use the conversation title or timestamp.
6. Click **Export Chat** again to start. The button will show "Exporting..." during the process.
7. The extension will:
   - Automatically scroll to load all messages in the conversation (including lazy-loaded older messages)
   - Extract content directly from the DOM (no clipboard needed!)
   - Convert formatting, tables, code blocks, and math formulas to Markdown
   - Remove Gemini citation markers like `[cite_start]` and `[cite:1,2,3]`
8. Your exported file will be named: `<conversation_title>_YYYY-MM-DD_HHMMSS.md` (e.g., `My_Conversation_2026-01-18_153012.md`)

**Supported formatting:**
- ✅ Text formatting (bold, italics, inline code)
- ✅ Headings (H1-H6)
- ✅ Code blocks with syntax highlighting markers
- ✅ Tables (converted to Markdown tables)
- ✅ Lists (ordered and unordered)
- ✅ Blockquotes
- ✅ Horizontal rules
- ✅ Math formulas (LaTeX from `data-math` attributes)
- ✅ Line breaks
- ✅ **Images** (embedded as base64 data URLs)

**Not supported:**
- ❌ Canvas/drawing responses
- ❌ File attachments (non-image)

**Note:** All content is extracted directly from the DOM using the Turndown library, ensuring accurate formatting preservation without clipboard dependencies.

### ChatGPT
1. Go to [ChatGPT](https://chatgpt.com/) and open any chat conversation.
2. Click the **Export Chat** button at the top right of the page.
3. Use the checkboxes and selection dropdown to choose which messages to export, just like in Gemini.
4. **(Optional)** Enter a custom filename, or leave blank to use the chat title or timestamp.
5. Choose your export mode:
   - **Export as file** (default): Downloads a Markdown (.md) file
   - **Export to clipboard**: Copies the conversation to your clipboard
6. Click **Export Chat** again to start. The button will show "Exporting..." during the process.
7. The extension will:
   - Automatically scroll to load all messages in the conversation
   - Use ChatGPT's built-in copy button to extract formatted content
   - Compile all selected messages into Markdown format
8. Your exported file will be named: `<chat_title>_YYYY-MM-DD_HHMMSS.md` (e.g., `My_Chat_Title_2026-01-18_153012.md`)

**Note:** ChatGPT export uses clipboard-based extraction via the platform's native copy button to ensure perfect formatting preservation.

## Permissions

This extension requires **storage** permission for extension settings and **clipboardRead** permission for ChatGPT exports. 

**Important change in v4.0.0:** Gemini exports no longer require clipboard access! The extension now uses direct DOM-based extraction with the Turndown library to convert Gemini's HTML responses to Markdown. This provides:
- ✅ More reliable extraction (no clipboard race conditions)
- ✅ Better formatting preservation (direct HTML→Markdown conversion)
- ✅ Enhanced privacy (no clipboard access needed for Gemini)

ChatGPT still requires clipboard access as it uses the built-in copy button for reliable content extraction.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## Attribution

Extension icons are generated using Gemini AI.