
# AI Chat Exporter

AI Chat Exporter is a Chrome Extension that allows you to export your entire Gemini or ChatGPT chat conversation (all messages in a single chat) to a well-formatted Markdown file with a single click.

## Features

- Export your full Gemini or ChatGPT chat conversation (all messages in a single chat) to Markdown, preserving formatting (code, tables, LaTeX, etc.)
- Dedicated "Export Chat" button appears automatically on every Gemini and ChatGPT chat page
- Option to hide the export button via the extension popup
- Flexible selection for Gemini: Quickly choose "All", "Only answers", or "None" from the export menu, or use per-message checkboxes to make a custom selection
- **Choose export mode for Gemini:** Select between "Export as file" (download Markdown) or "Export to clipboard" (copy the entire conversation to your clipboard) in the export dropdown.
- Deep Research export for Gemini: When a Deep Research report is open, a second "Export Deep Research Report" button appears. It exports only the Deep Research report content to Markdown and names the file after the report title.
- For ChatGPT: The exported Markdown uses the conversation title as the main heading and filename (spaces replaced with underscores, invalid filename characters removed)
- For Gemini: Exported Markdown uses a generic heading and filename, as Gemini does not provide a reliable conversation title in the page source
- Robust export logic: loads all messages in the current chat, copies perfectly formatted responses, and (for Gemini) removes citation markers
- Improved error handling: If copying a message fails, a placeholder is added in the Markdown file instructing you to manually copy and paste the missing content
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
## Usage


### Gemini
1. Go to [Gemini](https://gemini.google.com/) and open any chat conversation.
2. Click the "Export Chat" button at the top right of the page.
3. In the export menu, use the **Select messages** dropdown to quickly select "All", "Only answers" (AI responses), or "None". You can also manually check/uncheck any message using the checkboxes on the right of each message. If you make a custom selection, the dropdown will show "Custom".
4. Choose your export mode: "Export as file" (default) will download a Markdown file, or select "Export to clipboard" to copy the selected messages to your clipboard instead of downloading a file.
5. Wait for the export to complete. The button will show "Exporting..." during the process.
6. If you chose file export, a Markdown file will be downloaded automatically with all selected messages from the current chat conversation. The filename will be in the format `gemini_chat_export_YYYY-MM-DD_HHMMSS.md` (e.g., `gemini_chat_export_2025-07-16_153012.md`). If you chose clipboard export, you will see a confirmation popup and can paste the conversation anywhere you like.

#### Deep Research (Gemini)
If you're using Gemini's Deep Research experience, the extension can export those reports as well.

1. Open a Deep Research session so the page shows a Deep Research report.
2. A second button will appear below "Export Chat": "Export Deep Research Report".
3. Click it to download a Markdown file of the report content only (no regular chat turns). The filename matches the report title (taken from the first heading) with spaces replaced by underscores and invalid filename characters removed. If the title can’t be detected, the exporter falls back to a timestamped filename.
4. The exporter converts headings, paragraphs, lists, code blocks, tables, links, and images to clean Markdown while ignoring Gemini’s UI-only wrappers. Deep Research exports don’t include the chat-specific selection dropdown or per-message checkboxes.


### ChatGPT
1. Go to [ChatGPT](https://chatgpt.com/) and open any chat conversation.
2. Click the "Export Chat" button at the top right of the page.
3. Wait for the export to complete. The button will show "Exporting..." during the process.
4. A Markdown file will be downloaded automatically with all messages from the current chat conversation. The filename and heading will match the conversation title (spaces replaced with underscores, invalid filename characters removed), and a timestamp will be appended for uniqueness. The format is `<chat_title>_YYYY-MM-DD_HHMMSS.md` (e.g., `My_Chat_Title_2025-07-16_153012.md`).


## Permissions

This extension requires clipboard access permission (`clipboardRead`) in order to copy Gemini and ChatGPT responses using the built-in copy button. This is necessary for exporting perfectly formatted chat content. Storage permission is used for extension settings.

## Troubleshooting

- Clipboard blocked: If your browser blocks clipboard access, the exporter will try a text fallback. You may see a short note in the output where copy failed.
- Streaming/incomplete responses: Wait for responses to finish rendering before exporting.
- UI changes: If Gemini or ChatGPT update their UI, selectors may break. Please file an issue if the buttons don’t appear or export misses content.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## Attribution

Extension icons are generated using Gemini AI.