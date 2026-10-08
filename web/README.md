# DropPDF (Phase 1 Scratch Project)

A file converter with a conversion library that runs entirely in the browser.
Open `index.html` in Chrome or Edge. No installation, server, or internet connection is needed (libraries are bundled in `lib/`).

## How to use

1. Double-click `web/index.html` (or drag it into a Chrome/Edge window). On a Mac with Safari, run it on localhost instead (see the main README) so the Library can be saved.
2. **Add files**: drop files onto the box or click it to choose. You can also add a ZIP of photos: all photos are combined into one PDF. Files are only listed, not converted yet.
3. **Convert**: for each PDF, pick the output format on its row (Word, PowerPoint, PNG, JPG, Text). Click **Convert** on a row to convert just that file, or **Convert all**. To get another format later, change the row's format and click **Convert** again; there is no need to upload the file again.
4. Click **Download** on a finished row. A result with several files (for example a multi-page PDF → PNG/JPG) downloads as one ZIP. Every result is also kept in the **Library**, together with its original file. **Convert again** in the Library puts that original back into the convert list (or highlights it if it is already there).

## Major functions (CRUD)

| CRUD | Function |
|---|---|
| **Create** | Add files → Convert (one file or all) → the result is saved as a Library record; Convert again makes another record in a different format from the saved original |
| **Read** | Library list, search (name / memo / source), format filter, preview, re-download |
| **Update** | Rename the output file and edit its memo |
| **Delete** | Delete a Library record, or **Delete all** at once |

## Supported conversions

| Input | Output | How |
|---|---|---|
| Images: JPG, JPEG, PNG, WEBP, GIF, BMP | PDF | jsPDF |
| Text: TXT, TEXT, LOG, MD | PDF | Drawn on canvas pages |
| Web pages: HTML, HTM | PDF | Rendered in a sandboxed iframe (scripts and network blocked) |
| DOCX | PDF | docx-preview |
| XLSX, XLS, ODS | PDF | SheetJS (all sheets, wide tables in landscape) |
| PPTX, ODP | PDF | Custom slide renderer (one slide per page) |
| ODT, RTF | PDF | Custom converters |
| DOC, PPT (97-2003) | PDF | Text and table structure only |
| PDF | DOCX | One Word page per PDF page: the page's photos, shapes and background as one picture behind the text, editable text in front at its original position (size, bold, italic, color kept) |
| PDF | PPTX | One slide per page: page graphics as background + editable text boxes |
| PDF | PNG, JPG, TXT | pdf.js (multi-page images are saved as `name-1.png`, `name-2.png`, … inside a ZIP) |
| ZIP of photos | PDF | All photos combined into one PDF, one photo per page (A4, landscape for wide photos), in file-name order |

## Poster information

- **Description:** A zero-install web app that converts documents to and from PDF inside the browser and keeps every result in an editable local library.
- **Key Features:**
  - Convert Word, Excel, PowerPoint, OpenDocument, RTF, HTML, images, and text to PDF
  - Upload a ZIP of photos and get them combined into one PDF
  - Convert PDF to Word (DOCX) and PowerPoint (PPTX) that look like the original page, with editable text, or to PNG/JPG/TXT
  - Library with search, filter, preview, re-download, rename/memo (update), delete or delete all, and convert again from the saved original
  - 100% local: no server, no upload, no installation
- **Tools:** Claude Code (Opus 5.5), HTML/CSS/JavaScript, IndexedDB, pdf.js, jsPDF, html2canvas, SheetJS, docx-preview, JSZip
- **Platform:** Windows 11 and macOS; Chrome, Edge, or Safari 15.4+

```
 Browser (Chrome / Edge) ── opens index.html (file://)
 ┌───────────────────────────────────────────┐
 │ index.html + styles.css   ← UI            │
 │ app.js        ← UI, CRUD, image/text→PDF  │
 │ office.js     ← Office/HTML/RTF → PDF     │
 │ pdf-office.js ← PDF → DOCX / PPTX         │
 │  ├─ html2canvas + jsPDF  ← HTML → PDF     │
 │  ├─ pdf.js               ← read PDFs      │
 │  └─ JSZip                ← build DOCX/PPTX│
 └─────────────────────┬─────────────────────┘
                       │ create / read / update / delete
                 ┌─────▼──────┐
                 │ IndexedDB  │ ← records + output files
                 │ (browser)  │
                 └────────────┘
```

## Limitations

**PDF → Word / PowerPoint**
- Only DOCX and PPTX can be created. The old binary DOC and PPT (97-2003) formats are not supported as output. Every Word/PowerPoint version since 2007 opens DOCX/PPTX.
- No OCR: scanned (image-only) PDF pages become pictures, not editable text.
- DOCX layout: every PDF page becomes exactly one Word page (its own section with the same page size and orientation). Photos, shapes, lines, table borders and background colors are kept as one picture per page behind the text, so they look exactly like the PDF but cannot be moved or edited one by one. Text is always in front and stays editable.
- DOCX text keeps the PDF's line breaks. A line that would be wider in Word's font than in the PDF is slightly condensed so it never wraps onto an extra line. If you type a lot of extra text, Word can still push it onto a new page, and the background picture does not move with the text.
- DOCX paragraphs that overlap others (for example columns whose lines are not aligned) are placed in fixed, borderless text boxes.
- DOCX tables are not real Word tables: the borders are part of the background picture and the cell text is aligned with tab stops.
- DOCX fonts are mapped to Arial / Times New Roman / Courier New (Malgun Gothic for Korean).
- PPTX: each line of text is its own text box, so editing a long paragraph does not reflow it. Graphics stay as one background picture per slide (not editable shapes). All slides use the first page's size.

**To PDF**
- Every PDF output is made of page images, so its text cannot be selected or searched. This keeps Korean text from breaking without embedding fonts.
- Office files do not look identical to Microsoft Office. Text, tables, images, and basic formatting are kept. Charts, SmartArt, gradients and theme effects, headers/footers, and footnotes are dropped or simplified.
- Word files keep each page's size and orientation (portrait or landscape). Floating pictures and text boxes are placed at their position on the page, but text does not wrap around them.
- DOC and PPT (97-2003) input: only text and table structure are extracted. A DOC table with empty cells can have misaligned rows.
- HTML: only the single file is read, so images or CSS files next to it are not shown. Scripts and internet requests are blocked.

**ZIP**
- Photos are ordered by file name (numbers in natural order: `photo2` before `photo10`; folder names count too). The order cannot be changed in the app, so rename files to reorder.
- If the ZIP also contains other supported files (documents, PDFs), they are converted separately, and the result (the photo PDF plus those files) downloads as one ZIP. Unsupported files, hidden files and ZIPs inside the ZIP are skipped.
- Very large photos are scaled down to 4000 px on the long side. Many large photos make a large PDF and take a while.
- The 200 MB limit applies to the ZIP file itself.

**General**
- Password-protected files and Word 6/95 files are not supported. Maximum file size is 200 MB.
- The Library keeps each original file as well as the result, so it uses roughly twice the space. Records converted before this feature have no saved original, so they have no **Convert again** button.
- On a Mac with Safari opening the file directly, or in a private window, the browser may refuse to save the Library. The app then keeps results only until the tab is closed and shows a notice; use localhost to keep them.
- Word files made from PDFs use Malgun Gothic for Korean. On a Mac without that font, Word substitutes another, so line widths can differ slightly.
- The Library lives only in this browser. Clearing site data deletes it, and it is not shared with other browsers or PCs.
