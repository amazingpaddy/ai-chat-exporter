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

### HTML → Markdown mapping rules (Deep Research)
Convert the content within the `<deep-research-immersive-panel>` to clean Markdown using the mappings below. These rules are derived from the attached Deep Research HTML example and common web markup.

- Headings
  - `<h1>` → `# {text}`
  - `<h2>` → `## {text}`
  - `<h3>` → `### {text}`
  - `<h4>` → `#### {text}` (and keep going for deeper levels if needed)
- Paragraphs and line breaks
  - `<p>` → `{text}` followed by a blank line (collapse consecutive empty `<p>`s)
  - `<br>` → newline
- Inline formatting
  - `<b>`, `<strong>` → `**bold**`
  - `<i>`, `<em>` → `*italic*`
  - `<code>` (inline) → `` `code` `` (escape backticks inside)
  - HTML entities (e.g., `&nbsp;`, `&amp;`) → decode to plain text
- Lists
  - `<ul><li>…</li></ul>` → `- …` bullets; indent nested lists by two spaces per level
  - `<ol><li>…</li></ol>` → numbered list using `1. …` (Markdown will auto-number); indent nested lists by two spaces per level
  - Preserve list item content formatting (inline code, emphasis, etc.)
- Code blocks
  - `<pre><code class="language-xyz">…</code></pre>` → fenced block with language:
    - ```xyz
      …
      ```
  - `<pre>` without `<code>` → fenced block without language:
    - ```
      …
      ```
- Links and images
  - `<a href="URL">text</a>` → `[text](URL)` (omit tracking/query params only if safe and intentional)
  - `<img src="URL" alt="Alt">` → `![Alt](URL)`
- Tables
  - `<table>` → GitHub-Flavored Markdown table. Use first row with `<th>` as header when present; otherwise, treat first `<tr>` as header.
  - Example conversion: `<tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr>` →
    - `| A | B |`
    - `| --- | --- |`
    - `| 1 | 2 |`
- Blockquotes and rules
  - `<blockquote>` → prefix each paragraph line with `>`
  - `<hr>` → `---` on its own line
- Structural wrappers to ignore/strip (UI-only in the example)
  - Drop these tags but keep their textual descendants: `deep-research-immersive-panel`, `toolbar`, `response-container`, `message-content`, `thinking-panel`, `collapsible-button`, `deep-research-source-lists`, `canvas-create-button`, `mat-menu`, `mat-icon`, `browse-web-item`, `horizontal-scroll-wrapper`, and other Angular/material wrappers.
  - Generic containers: treat `<div>` and `<span>` as transparent wrappers (don’t emit Markdown themselves); rely on their child elements to produce blocks/inline content. If a `<div>` contains plain text without block children, render it as a paragraph.
  - Drop custom placeholders/noise elements entirely (do not render): `response-element`, `source-footnote`, `sources-carousel-inline`, “end-of-report-marker”, and any elements that don’t contribute visible text content.
  - Ignore all attributes like `class`, `style`, `aria-*`, `data-*`, Angular `ng-*` markers.
- Whitespace and cleanup
  - Trim leading/trailing whitespace per block, collapse multiple blank lines to a single blank line (outside code blocks)
  - Preserve whitespace inside code blocks
  - Normalize smart quotes and unicode spaces to plain equivalents when reasonable
  - Remove UI or telemetry text (e.g., button labels not part of the report body)

Notes
- The provided example uses headings (`<h1>…</h1>`, `<h2>…</h2>`, `<h3>…</h3>`), paragraphs, lists (`<ul>`, `<ol>`, `<li>`), and inline `<code>` heavily—ensure these produce readable Markdown without extra empty lines.
- If future Deep Research content includes images, links, or tables, the mappings above apply without additional changes.

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
