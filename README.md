# AI Chat Exporter

AI Chat Exporter is a Chrome Extension that allows you to export your entire Gemini or ChatGPT chat conversation to a well-formatted Markdown file or copy it to your clipboard—with perfect preservation of LaTeX math, code, and formatting.

## Features

- Export your full Gemini or ChatGPT chat conversation to Markdown, preserving formatting (code, tables, LaTeX, etc.)
- Dedicated "Export Chat" button appears automatically on every Gemini and ChatGPT chat page
- Option to hide the export button via the extension popup
- Granular message selection: Use checkboxes next to each message to select exactly what to export
- Selection presets: Instantly select all, none, or only AI responses with a dropdown or quick toggles
- Export to clipboard: Copy your chat as Markdown directly to your clipboard—no file download needed
- Custom filename (optional): Enter a filename, or leave blank to use the chat title or a timestamp. The input is always empty by default and resets after export
- Robust export logic: loads all messages in the current chat, copies perfectly formatted responses, and (for Gemini) removes citation markers
- Improved error handling: If copying a message fails, a placeholder is added in the Markdown file instructing you to manually copy and paste the missing content
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

## Usage

### Gemini
1. Go to [Gemini](https://gemini.google.com/) and open any chat conversation.
2. Click the "Export Chat" button at the top right of the page.
3. In the export menu, use the **Select messages** dropdown to quickly select "All", "Only answers" (AI responses), or "None". You can also manually check/uncheck any message using the checkboxes on the right of each message. If you make a custom selection, the dropdown will show "Custom".
4. Choose your export mode: "Export as file" (default) will download a Markdown file, or select "Export to clipboard" to copy the selected messages to your clipboard instead of downloading a file.
5. Optionally enter a filename, or leave blank to use the chat title or timestamp. The input is always empty by default and resets after export.
6. Wait for the export to complete. The button will show "Exporting..." during the process.
7. If you chose file export, a Markdown file will be downloaded automatically with all selected messages from the current chat conversation. The filename will be in the format `gemini_chat_export_YYYY-MM-DD_HHMMSS.md` (e.g., `gemini_chat_export_2025-07-16_153012.md`). If you chose clipboard export, you will see a confirmation popup and can paste the conversation anywhere you like.

### ChatGPT
1. Go to [ChatGPT](https://chatgpt.com/) and open any chat conversation.
2. Click the "Export Chat" button at the top right of the page.
3. Use the checkboxes and selection dropdown to choose which messages to export, just like in Gemini.
4. Optionally enter a filename, or leave blank to use the chat title or timestamp. The input is always empty by default and resets after export.
5. Choose your export mode: "Export as file" (default) will download a Markdown file, or select "Export to clipboard" to copy the selected messages to your clipboard instead of downloading a file.
6. Wait for the export to complete. The button will show "Exporting..." during the process.
7. If you chose file export, a Markdown file will be downloaded automatically with all selected messages from the current chat conversation. The filename and heading will match the conversation title (spaces replaced with underscores, invalid filename characters removed), and a timestamp will be appended for uniqueness. The format is `<chat_title>_YYYY-MM-DD_HHMMSS.md` (e.g., `My_Chat_Title_2025-07-16_153012.md`).

## Permissions

This extension requires clipboard access permission (`clipboardRead`) in order to copy Gemini and ChatGPT responses using the built-in copy button. This is necessary for exporting perfectly formatted chat content, especially LaTeX math. Storage permission is used for extension settings.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## Attribution

Extension icons are generated using Gemini AI.