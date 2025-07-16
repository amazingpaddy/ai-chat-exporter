
# AI Chat Exporter

AI Chat Exporter is a Chrome Extension that allows you to export your entire Gemini or ChatGPT chat conversation (all messages in a single chat) to a well-formatted Markdown file with a single click.

## Features

- Export your full Gemini **or ChatGPT** chat conversation (all messages in a single chat) to Markdown, preserving formatting (code, tables, LaTeX, etc.)
- Dedicated "Export Chat" button appears automatically on every Gemini and ChatGPT chat page
- Option to hide the export button via the extension popup
- For ChatGPT: The exported Markdown uses the conversation title as the main heading and filename (spaces replaced with underscores, invalid filename characters removed)
- For Gemini: Exported Markdown uses a generic heading and filename, as Gemini does not provide a reliable conversation title in the page source
- Robust export logic: loads all messages in the current chat, copies perfectly formatted responses, and (for Gemini) removes citation markers
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
1. Go to [Gemini](https://gemini.google.com/) and open any chat conversation
2. Click the "Export Chat" button at the top right of the page (it will not overlap your profile icon)
3. Wait for the export to complete. The button will show "Exporting..." during the process
4. A Markdown file (`gemini_chat_export.md`) will be downloaded automatically with all messages from the current chat conversation. (Gemini does not provide a reliable conversation title, so a generic filename and heading are used.)

### ChatGPT
1. Go to [ChatGPT](https://chatgpt.com/) and open any chat conversation
2. Click the "Export Chat" button at the top right of the page
3. Wait for the export to complete. The button will show "Exporting..." during the process
4. A Markdown file will be downloaded automatically with all messages from the current chat conversation. The filename and heading will match the conversation title (spaces replaced with underscores, invalid filename characters removed).

## Permissions

This extension requires clipboard access permission (`clipboardRead`) in order to copy Gemini and ChatGPT responses using the built-in copy button. This is necessary for exporting perfectly formatted chat content.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## Attribution

Extension icons are generated using Gemini AI.