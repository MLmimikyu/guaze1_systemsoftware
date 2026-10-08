# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context

This repo is a CSE406 **Phase 1 Scratch Project**: a small, local-only CRUD web app with 2–3 major functions, delivered as a one-page poster + ≤3-minute YouTube demo. Keep changes small and simple — the assignment explicitly forbids large-scale implementation, and none of this code carries over to Phase 2.

The app, "DropPDF", lives in `web/`. Its UI and messages are English; code comments are Korean. Run it by opening `web/index.html` in Chrome/Edge, or serve it with `python -m http.server 8000 --bind 127.0.0.1 --directory web` (`.claude/launch.json` does this for the preview pane). Node/pnpm are **not installed** on the author's machine; there is no build step. An older Electron version was removed from the repo.

**Read [HANDOFF.md](HANDOFF.md) first** for the current status, open to-dos (poster and video deadlines, Mac checks), and the demo video script. It is written in Korean for the user. Update it when the status changes.

## web/ (zero-install browser app)

**Hard constraint: it must keep working when opened from `file://` with no server and no internet.** Consequences:
- Only classic `<script>` tags — no `type="module"`, no `import`, no `fetch()` of local files (all blocked on `file://`).
- `web/lib/` holds pinned UMD builds: **pdf.js 3.11.174**, **jsPDF 2.5.1**, **html2canvas 1.4.1**, **JSZip 3.10.1**, **SheetJS 0.18.5**, **docx-preview 0.3.7** (needs global `JSZip`). Do not upgrade pdf.js to v4+ (ESM-only) and do not switch to CDN links. Script order in `index.html` matters: libs → `office.js` → `pdf-office.js` → `app.js`.
- `lib/pdf.worker.min.js` is loaded as a plain script on purpose: it defines `globalThis.pdfjsWorker`, so pdf.js runs its worker on the main thread instead of spawning a `Worker`, which fails from `file://`.

`web/app.js` is one classic script, organized top-to-bottom as: file-type helpers → `recordStore` (IndexedDB CRUD; DB `droppdf-web`, store `records`, keyPath `id`) → converters → download/preview → UI rendering and event wiring. Its top-level `const`/`let`/function declarations are shared globals, so a test page can call `enqueueFiles`, `recordStore`, `converting`, etc. directly.

UI flow: added files go into an in-memory `queue`.
- Each queue item has its own target `item.format`, set by the row's dropdown for PDFs. New rows default to the last choice (`defaultPdfTarget`). For non-PDF files the value is only used for PDFs inside a ZIP.
- Nothing converts until **Convert all** calls `startConversion()`, or a row's **Convert** calls `convertOne(item)`.
- Changing a finished row's format, or pressing Convert on it, resets it to pending. Each conversion adds a new Library record.
- Both chain onto the `converting` promise and go through `convertItems`, which skips items that are no longer pending.
- Nothing downloads until a row's Download button is clicked.
- A test harness calls `enqueueFiles([...])`, then `await startConversion()` or `await convertOne(queue[i])`.

Record shape: `{ id, title, memo, sourceName, sourceSize, format: "pdf"|"png"|"jpg"|"txt"|"docx"|"pptx"|"zip", outputs: Blob[], outputNames: string[]|null, outputSize, source: File, createdAt, updatedAt }`.
- `source` is the original uploaded file. The Library's **Convert again** (`reuseSource`) re-enqueues it, or highlights the row if the same file is already queued, so no re-upload is needed. Older records may lack it.
- `recordStore.clear()` backs **Delete all** (`clearLibrary`).
- A ZIP input (`convertArchive`): all image entries are combined into one PDF by `imagesToPdf` (one A4 page per image, in natural file-name order).
  - If the ZIP holds only images, the record is a plain `"pdf"` record.
  - Other supported entries are converted with recursive `convert()` calls. The record then gets format `"zip"`, and `outputNames` keeps the entry names.
- Without `outputNames`, multi-output records are named `title-1.png`, `title-2.png`, ….
- `downloadRecord` downloads a single output as `title.ext` and bundles multiple outputs into `title.zip` with JSZip.

Every PDF output is **rasterized** (JPEG pages), so Korean renders correctly with system fonts (jsPDF's built-in fonts have no Hangul glyphs), but PDF text isn't selectable. `app.js` handles images and plain text itself, drawing text onto A4 canvases. All other input goes through `web/office.js`, where `DOCUMENT_CONVERTERS` maps each extension to a converter:
- Every converter produces HTML. `renderHtmlToPdf` loads that HTML into an off-screen `<iframe sandbox="allow-same-origin allow-scripts" srcdoc>` with a CSP `<meta>` (`FRAME_CSP`) that blocks scripts and network requests. `allow-scripts` is required: Safari never fires JS listeners on nodes inside a script-disabled frame, so html2canvas would wait forever for its clone iframe to load. The CSP, which every frame document must carry first in `<head>`, is what keeps scripts out (user HTML is also sanitized). It captures the page with html2canvas in chunks of at most `MAX_CAPTURE_HEIGHT_PX` and writes the pages with jsPDF.
- `findPageBreaks` picks page cut points that don't slice text lines, images or table rows. Slides use fixed page heights instead (`slideHeightPx`).
- Libraries: DOCX uses docx-preview, rendering directly into the iframe document. XLS/XLSX/ODS use SheetJS `sheet_to_html`.
- DOCX → PDF (`docxToPdf`, also used for the Library preview of DOCX records):
  - docx-preview runs with `ignoreWidth/ignoreHeight: false`, so each `section.docx` has the document's real page size. Each section is captured at its own size via `capturePages` (landscape stays landscape). A section longer than its page is split, and empty continuation pages are skipped.
  - docx-preview mishandles floating objects: `wp:anchor` pictures are drawn on top of the text at paragraph-relative positions, and `wps` text boxes are dropped. `extractFloatingObjects` therefore removes every anchor from `document.xml` before rendering, leaving an invisible marker run. `placeFloatingObjects` then draws each one absolutely positioned in its section (`behindDoc` → `z-index:-1`).
  - Tabs: docx-preview ignores tab-stop positions. Its `experimental` tab mode miscalculates inside our iframe, so don't enable it. `extractFloatingObjects` replaces each body `w:tab` with an invisible marker carrying the paragraph's tab stops (pt). `placeTabStops` turns each marker into a spacer reaching the next stop, measured from the section's left margin like Word (default stops every 36pt).
  - docx-preview emits images as `data:application/octet-stream`. html2canvas skips non-`data:image/*` URLs, so `docxToPdf` rewrites the MIME type from the base64 magic bytes.
  - Exact-line-height paragraphs need `vertical-align: top` on their spans (see `DOCX_CSS`). Otherwise mixed font sizes make each line taller and positions drift.
- `capturePages` is the shared html2canvas → jsPDF step. Pages can differ in size and orientation, and vertically adjacent pages are captured in one pass.
- Hand-written converters: PPTX, ODP, ODT and RTF.
  - The PPTX renderer resolves position, font size, color and bullets by walking slide → layout → master placeholders; see `findPlaceholder` and `inherited`.
  - ODF styles resolve through their `style:parent-style-name` chain; see `odfStyleProps`.
- Old binary DOC/PPT are opened with `XLSX.CFB` (SheetJS's OLE reader). Only text and table structure are extracted: the DOC piece table, and PPT `TextCharsAtom`/`TextBytesAtom` records.

`web/pdf-office.js` converts PDF → DOCX/PPTX. It assembles the OOXML packages by hand with JSZip; no template files are used.
- `readPageLines` groups pdf.js text items into lines and segments. Whitespace-only items are dropped on purpose, and spaces are re-inserted based on the gaps between items.
- DOCX: one section per PDF page (own `pgSz`, tiny margins, `bottom=0`), so pages map 1:1.
  - Each page starts with a near-zero-height marker paragraph. It carries a `behindDoc` page-sized anchor of the text-free page render (scanned pages use the full render), so photos, shapes and backgrounds keep the PDF's stacking order.
  - Each page ends with a marker paragraph holding that page's `sectPr`.
- DOCX text is always in front. Lines are merged into paragraphs (`buildParagraphs`) but keep the PDF line breaks (`w:br`).
  - Vertical position comes from an exact line height plus `spaceBefore` relative to the previous flowed paragraph. Horizontal position comes from the left indent and tab stops.
  - `fitScale` measures each segment with canvas `measureText` in the fonts Word will use. If it would overflow, it sets `w:w` (character width %) so Word never adds wrapped lines that push content to another page.
  - A paragraph whose top is above the current flow bottom (unaligned columns, side notes) is put in a page-positioned `wps` text box instead (`docxTextBoxAnchor`).
- Do not go back to per-image/per-shape anchors with Word text wrapping. That was tried and caused shapes hiding photos, backgrounds cropped to text areas, and spacing counted twice (extra pages).
- Text color comes from `colorLines` (shared with PPTX). Word's Asian/Latin auto-spacing is turned off in the styles.
- PPTX: each page is rendered twice, once with text hidden (`renderPageCanvas({ hideText })`: `fillText`/`strokeText` stubbed, plus `hideGlyphPaths` empties Type3 glyph procs and path-glyph generators — Mac Chrome's "Save as PDF" of Korean pages produces Type3 fonts that bypass `fillText`). The text-free render becomes the slide background, and each text segment becomes a `wrap="none"` text box. Its color is sampled by diffing the two renders.
- Validate generated DOCX/PPTX by opening them in real Word and PowerPoint via COM (`Documents.Open`, `Presentations.Open`, `Slide.Export`). Office rejects malformed packages that browsers would accept.
- The Library preview for DOCX/PPTX records renders them back to PDF through `DOCUMENT_CONVERTERS`.

`web/README.md` holds the poster-ready content (description, features, tools, architecture diagram). Update it when features change.

### Verifying web/ changes
`web/` has no automated test suite. To verify a change, run headless Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe --headless=new --remote-debugging-port=…`) against a copy of `index.html` that also loads a harness script. Drive it over the DevTools protocol (`Runtime.evaluate` with `awaitPromise`); PowerShell's `System.Net.WebSockets.ClientWebSocket` works for this. Don't use `--dump-dom`: it snapshots before async IndexedDB/canvas work finishes. Don't pass `--allow-file-access-from-files` either, or the test won't match how real users open the page. The harness can't read local files from `file://`, so embed sample files in a generated JS file as base64 and call `convert(file, "png", () => {})` on each. Microsoft Office is installed on the dev machine; real samples of every format can be generated through COM (`Word.Application`, `PowerPoint.Application`, `Excel.Application` → `SaveAs`). Visually check rendered output pages, not just that conversion didn't throw.

**Mac / Safari support (baseline Safari 15.4):**
- Don't use regex lookbehind (`(?<=` / `(?<!`): Safari < 16.4 fails to parse the whole file.
- Avoid newer APIs (`findLast`, `toSorted`, `structuredClone`).
- File names are normalized to NFC in `enqueueFiles` (macOS often gives NFD Hangul). ZIP entry names go through `decodeZipName` (UTF-8, falling back to CP949) and `entryName` (NFC).
- If IndexedDB fails (Safari on `file://`, private windows), `recordStore` switches to the in-tab `memoryRecords` map via `storeCall` and shows `#storage-warning`.
- Fonts always list a Mac fallback (Apple SD Gothic Neo, Menlo) after the Windows font.
- TextEdit's DOCX has an empty `<w:sectPr/>`; `extractFloatingObjects` fills in a default A4 `pgSz`/`pgMar` for any section missing them.
- To test in Safari on the Mac: enable Safari's "Allow JavaScript from Apple Events" and drive it with `osascript -e 'tell application "Safari" to do JavaScript "…" in front document'` (poll a `window` variable for async results). Headless Chrome on the Mac is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

The Claude desktop preview pane pauses rendering while it is hidden, so pdf.js/html2canvas calls can hang there. Use a separate headless Chrome (above) for conversion tests. Browsers cache `office.js`/`app.js` aggressively on `localhost`; after edits, hard-refresh (Ctrl+F5) or `fetch(url, { cache: "reload" })` before reloading.
