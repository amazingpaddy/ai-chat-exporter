# AI Chat Exporter — Gemini Deep Research Export Roadmap

This roadmap describes the changes needed to add a new inline “Export Deep Research Report” button to the Gemini content script, enabling export of Deep Research reports that live inside the `<deep-research-immersive-panel>` element.

## Goals
- Provide a second export button that appears directly below the existing “Export Chat” button when Deep Research is detected.
- Keep the same design (size, color, hover, shadow) as the original button.
- Export only the content contained within `<deep-research-immersive-panel>`, mirroring the existing Gemini chat export structure.

## 1) UX and entry points
- Add a second fixed-position button:
  - ID: `gemini-export-deep-research-btn`
  - Text: `Export Deep Research Report`
  - Position: same right alignment; top offset just below `Export Chat` (e.g., +44px)
  - Styling: identical to `Export Chat`
- Conditional visibility:
  - Show only when `document.querySelector('deep-research-immersive-panel')` is present.
  - Keep live-updated via a MutationObserver on `document.body`.

Acceptance:
- On non-Deep-Research pages, only “Export Chat” is visible.
- On Deep Research sessions, both buttons are visible; Deep Research button appears directly below “Export Chat”.

## 2) Detection logic for Deep Research
- On script init and whenever DOM changes, toggle Deep Research button visibility based on existence of `<deep-research-immersive-panel>`.
- If the panel disappears due to SPA navigation, hide the button automatically.

Acceptance:
- The Deep Research button visibility updates without page reloads.

## 3) Refactor shared helpers (internal)
Extract shared utilities in `src/content_scripts/gemini.js` so both export flows reuse them:
- `sleep(ms)`
- `removeCitations(text)` — keep current behavior for Gemini
- `getDateString()` — centralized timestamp for filenames
- `createToast(text, ttlMs)` — consistent lightweight progress notifications
- `findTurns(root)` — return array of turn containers under a given root
- `extractUserQuery(turn)` — robustly retrieve user query with small retries
- `copyModelResponse(turn)` — copy via Gemini copy button with retries; fallback to `textContent`
- `buildMarkdown(title, turns, startTurn)` — assemble the standard sectioned markdown

Acceptance:
- No behavior change for existing “Export Chat”. Code becomes easier to maintain.

## 4) Implement Deep Research export
- New function: `async function geminiDeepResearchExportMain(startTurn = 1)`
  - Scope queries to: `const panel = document.querySelector('deep-research-immersive-panel')`
  - If missing, show a friendly alert and abort.
  - `const turns = findTurns(panel)` and reuse `extractUserQuery`, `copyModelResponse`, `removeCitations`, and `buildMarkdown`.
  - Title: `# Gemini Deep Research Report`
  - Filename: `gemini_deep_research_${getDateString()}.md`

Acceptance:
- Outputs a .md file with only Deep Research content, following the same structure as normal exports.

## 5) Edge cases and resilience
- Clipboard blocked or no copy button: Use `textContent` fallback with a note when needed.
- Streaming/incomplete responses: add small delays/retries or inform the user to wait.
- Normalize extra newlines and strip citations.
- Long reports: Avoid unnecessary scrolling outside the panel; operate locally within the panel.

Acceptance:
- Export succeeds with usable content even under degraded conditions.

## 6) Manual testing
- Without Deep Research: Only “Export Chat” visible; normal export works.
- With Deep Research: Second button appears; export produces Deep Research .md file.
- Start turn variations: Export from 1 and >1 turn.
- Dark/light themes: Visual parity with existing button.
- Clipboard blocked: Fallback kicks in.
- SPA navigation: Button visibility toggles correctly when panel appears/disappears.

## 7) Documentation
- Update `README.md`:
  - Describe the Deep Research export, when the button appears, how to use it.
  - Limitations/Troubleshooting (clipboard permissions, streaming content, UI changes).
  - Optional GIF or screenshots.

## 8) Versioning & release
- Bump `manifest.json` version (e.g., 3.1.0).
- No new permissions required.
- Test load in the browser’s Extensions page and validate on Gemini.

---

## Implementation pointers
- File to modify: `src/content_scripts/gemini.js`
- Add the new button programmatically alongside the existing one, with identical styles and a slightly larger `top` CSS value so it sits below.
- Use a MutationObserver to toggle `.style.display` based on `<deep-research-immersive-panel>` presence.
- Wire the button’s click handler to `geminiDeepResearchExportMain(startTurn)` (reuse the same start-turn input, or default to 1 if preferred).
