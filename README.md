# DropPDF

A zero-install web app that converts documents to and from PDF right in the browser and keeps every result in an editable library.
CSE406 Phase 1 Scratch Project.

## Run

Open [`web/index.html`](web/index.html) in Chrome or Edge. No installation, server, or internet connection is needed.

Or serve it on localhost (needs Python):

```bash
python -m http.server 8000 --bind 127.0.0.1 --directory web
```

Then open http://localhost:8000.

## What it does

- **Convert to PDF:** Word, Excel, PowerPoint, OpenDocument, RTF, HTML, images, text
- **Convert from PDF:** to Word (DOCX) and PowerPoint (PPTX) that keep the page layout, or to PNG / JPG / TXT
- **ZIP of photos:** combined into one PDF
- **Library (CRUD):** search, preview, download, rename / memo, delete, convert again from the saved original

Details, architecture, and limitations: [`web/README.md`](web/README.md).

Built with Claude Code.
