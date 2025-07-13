# Gemini Chat Exporter

Gemini Chat Exporter is a Chrome Extension that allows you to export your entire Gemini chat conversation to a well-formatted Markdown file with a single click.

## Features

- Export your full Gemini chat history to Markdown, preserving formatting (code, tables, LaTeX, etc.)
- Dedicated "Export Chat" button appears automatically on every Gemini chat page
- Robust export logic: loads all chat history, copies perfectly formatted responses, and removes Gemini citation markers
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
   - The "Export Chat" button will now appear on every Gemini chat page

## Usage

1. Go to [Gemini](https://gemini.google.com/) and open any chat
2. Click the "Export Chat" button at the top right of the page (it will not overlap your profile icon)
3. Wait for the export to complete. The button will show "Exporting..." during the process
4. A Markdown file (`gemini_chat_export.md`) will be downloaded automatically with your full chat history

## Permissions

This extension requires clipboard access permission (`clipboardRead`) in order to copy Gemini responses using the built-in copy button. This is necessary for exporting perfectly formatted chat content.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the [Apache License 2.0](LICENSE).

## Attribution

<a href="https://www.flaticon.com/free-icons/export" title="export icons">Export icons created by Parzival’ 1997 - Flaticon</a>