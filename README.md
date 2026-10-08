# DropPDF

A zero-install web app that converts documents to and from PDF right in the browser and keeps every result in an editable library.
CSE406 Phase 1 Scratch Project.

## Run

**Windows / Mac:** open [`web/index.html`](web/index.html) in Chrome or Edge. No installation, server, or internet connection is needed.

**Mac with Safari** (Safari 15.4 or later): run it on localhost so the Library can be saved. Python 3 is preinstalled on most Macs:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory web
```

Then open http://localhost:8000. On Windows the command is `python` instead of `python3`.

After updating the code, hard-refresh the page: **Ctrl+F5** (Windows) or **Cmd+Shift+R** (Mac).

## What it does

- **Convert to PDF:** Word, Excel, PowerPoint, OpenDocument, RTF, HTML, images, text
- **Convert from PDF:** to Word (DOCX) and PowerPoint (PPTX) that keep the page layout, or to PNG / JPG / TXT
- **ZIP of photos:** combined into one PDF
- **Library (CRUD):** search, preview, download, rename / memo, delete, convert again from the saved original

Details, architecture, and limitations: [`web/README.md`](web/README.md).

Built with Claude Code.
