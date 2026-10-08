"use strict";

// ---------------------------------------------------------------------------
// 파일 형식
// ---------------------------------------------------------------------------
const IMAGE_EXTENSIONS = new Set(["bmp", "gif", "jpeg", "jpg", "png", "webp"]);
const TEXT_EXTENSIONS = new Set(["log", "md", "text", "txt"]);
const MAX_FILE_SIZE = 200 * 1024 * 1024;
const OUTPUT_MIME = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  txt: "text/plain;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function getExtension(name) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index + 1).toLowerCase();
}

function getStem(name) {
  const index = name.lastIndexOf(".");
  return index <= 0 ? name : name.slice(0, index);
}

function getFileKind(name) {
  const extension = getExtension(name);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if (extension === "pdf") return "pdf";
  if (extension === "zip") return "archive";
  if (DOCUMENT_CONVERTERS[extension]) return "document";
  return "unsupported";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// 저장소 (IndexedDB) — CRUD
// ---------------------------------------------------------------------------
const DB_NAME = "droppdf-web";
const STORE = "records";
let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function withStore(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("The storage operation was aborted."));
  });
}

const recordStore = {
  create: (record) => withStore("readwrite", (store) => store.add(record)),
  list: () => withStore("readonly", (store) => store.getAll()),
  get: (id) => withStore("readonly", (store) => store.get(id)),
  update: (record) => withStore("readwrite", (store) => store.put(record)),
  remove: (id) => withStore("readwrite", (store) => store.delete(id)),
  clear: () => withStore("readwrite", (store) => store.clear()),
};

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// 변환기
// ---------------------------------------------------------------------------
const A4 = { widthMm: 210, heightMm: 297, marginMm: 10 };
const RENDER_DPI = 150;
const MAX_IMAGE_SIDE = 4000;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the image."))), type, quality);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image."));
    };
    image.src = url;
  });
}

// 이미지마다 A4 한 페이지(가로 사진은 가로 방향)에 맞춰 넣어 PDF 하나로 만든다.
async function imagesToPdf(files, onProgress = () => {}) {
  let pdf = null;
  for (const [index, file] of files.entries()) {
    if (files.length > 1) onProgress(`Adding image ${index + 1}/${files.length}…`);
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const orientation = canvas.width > canvas.height ? "landscape" : "portrait";
    const pageWidth = orientation === "landscape" ? A4.heightMm : A4.widthMm;
    const pageHeight = orientation === "landscape" ? A4.widthMm : A4.heightMm;
    const boxWidth = pageWidth - A4.marginMm * 2;
    const boxHeight = pageHeight - A4.marginMm * 2;
    const fit = Math.min(boxWidth / canvas.width, boxHeight / canvas.height);
    const width = canvas.width * fit;
    const height = canvas.height * fit;

    if (pdf) pdf.addPage("a4", orientation);
    else pdf = new jspdf.jsPDF({ orientation, unit: "mm", format: "a4" });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
  }
  return pdf.output("blob");
}

async function readText(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // 한국어 Windows 메모장에서 저장한 ANSI(CP949) 파일 대응
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

function wrapLine(context, line, maxWidth) {
  if (line === "") return [""];
  const rows = [];
  let current = "";
  for (const character of line) {
    const candidate = current + character;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    const breakAt = current.lastIndexOf(" ");
    if (breakAt > 0 && character !== " ") {
      rows.push(current.slice(0, breakAt));
      current = current.slice(breakAt + 1) + character;
    } else {
      rows.push(current);
      current = character === " " ? "" : character;
    }
  }
  rows.push(current);
  return rows;
}

// 텍스트를 A4 크기 캔버스에 그려서 PDF로 만든다. 시스템 글꼴을 쓰므로 한글이 깨지지 않는다.
async function textToPdf(file) {
  const text = (await readText(file)).replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const pxPerMm = RENDER_DPI / 25.4;
  const pageWidth = Math.round(A4.widthMm * pxPerMm);
  const pageHeight = Math.round(A4.heightMm * pxPerMm);
  const margin = Math.round(14 * pxPerMm);
  const fontSize = Math.round((10.5 / 72) * RENDER_DPI);
  const lineHeight = Math.round(fontSize * 1.65);

  const canvas = document.createElement("canvas");
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const context = canvas.getContext("2d");
  const font = `${fontSize}px Consolas, "Malgun Gothic", "Apple SD Gothic Neo", monospace`;
  context.font = font;

  const rows = text.split("\n").flatMap((line) => wrapLine(context, line, pageWidth - margin * 2));
  const rowsPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);
  const pdf = new jspdf.jsPDF({ unit: "mm", format: "a4" });

  for (let start = 0, page = 0; start < Math.max(rows.length, 1); start += rowsPerPage, page += 1) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = "#17231f";
    context.font = font;
    context.textBaseline = "top";
    rows.slice(start, start + rowsPerPage).forEach((row, index) => {
      context.fillText(row, margin, margin + index * lineHeight);
    });
    if (page > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, A4.widthMm, A4.heightMm);
  }
  return [pdf.output("blob")];
}

async function openPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  } catch (error) {
    if (error?.name === "PasswordException") throw new Error("Password-protected PDFs are not supported.");
    throw new Error("Could not read the PDF file.");
  }
}

async function pdfToImages(file, format, onProgress) {
  const pdf = await openPdf(file);
  const outputs = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Converting page ${pageNumber}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_DPI / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      outputs.push(await canvasToBlob(canvas, OUTPUT_MIME[format], 0.92));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return outputs;
}

async function pdfToText(file, onProgress) {
  const pdf = await openPdf(file);
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Extracting text from page ${pageNumber}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str + (item.hasEOL ? "\n" : "")).join(""));
    }
  } finally {
    await pdf.destroy();
  }
  const text = pages.join("\n\n\f\n\n").trim();
  if (!text) throw new Error("This PDF has no text. For scanned PDFs, convert to PNG or JPG.");
  return [new Blob(["﻿" + text], { type: OUTPUT_MIME.txt })];
}

function uniqueName(name, taken) {
  let candidate = name;
  for (let index = 2; taken.has(candidate.toLowerCase()); index += 1) candidate = `${getStem(name)} (${index}).${getExtension(name)}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

// ZIP 안의 사진은 이름 순서대로 PDF 하나로 묶는다(사진 한 장 = 한 페이지).
// 사진이 아닌 지원 파일이 섞여 있으면 따로 변환해 함께 내보내고, 그때는 결과가 여러 개라 ZIP으로 내려받는다.
async function convertArchive(file, pdfFormat, onProgress) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("Could not open the ZIP file.");
  }
  const entries = Object.values(zip.files)
    .filter((entry) => {
      const name = entry.name.split("/").pop();
      return !entry.dir && name && !name.startsWith(".") && !entry.name.startsWith("__MACOSX/")
        && !["unsupported", "archive"].includes(getFileKind(name));
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (entries.length === 0) throw new Error("The ZIP has no supported files.");

  const blobs = [];
  const names = [];
  const taken = new Set();
  const isImage = (entry) => getFileKind(entry.name) === "image";
  const images = entries.filter(isImage);
  if (images.length > 0) {
    const files = await Promise.all(images.map(async (entry) => new File([await entry.async("blob")], entry.name.split("/").pop())));
    blobs.push(await imagesToPdf(files, onProgress));
    names.push(uniqueName(`${getStem(file.name)}.pdf`, taken));
  }

  const others = entries.filter((entry) => !isImage(entry));
  for (const [index, entry] of others.entries()) {
    const name = entry.name.split("/").pop();
    const prefix = `File ${index + 1}/${others.length} (${name})`;
    onProgress(`${prefix}…`);
    const inner = new File([await entry.async("blob")], name);
    const result = await convert(inner, pdfFormat, (message) => onProgress(`${prefix}: ${message}`));
    result.blobs.forEach((blob, page) => {
      const suffix = result.blobs.length > 1 ? `-${page + 1}` : "";
      names.push(uniqueName(`${getStem(name)}${suffix}.${result.format}`, taken));
      blobs.push(blob);
    });
  }
  // 사진만 들어 있던 ZIP은 결과가 PDF 하나이므로 일반 PDF 기록으로 남긴다.
  if (others.length === 0) return { format: "pdf", blobs };
  return { format: "zip", blobs, names };
}

async function convert(file, pdfFormat, onProgress) {
  const kind = getFileKind(file.name);
  if (kind === "unsupported") throw new Error("Unsupported file type.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Files must be 200 MB or smaller.");

  if (kind === "archive") return convertArchive(file, pdfFormat, onProgress);
  if (kind === "image") return { format: "pdf", blobs: [await imagesToPdf([file])] };
  if (kind === "text") return { format: "pdf", blobs: await textToPdf(file) };
  if (kind === "document") return { format: "pdf", blobs: [await DOCUMENT_CONVERTERS[getExtension(file.name)](file, onProgress)] };
  if (pdfFormat === "txt") return { format: "txt", blobs: await pdfToText(file, onProgress) };
  if (pdfFormat === "docx") return { format: "docx", blobs: [await pdfToDocx(file, onProgress)] };
  if (pdfFormat === "pptx") return { format: "pptx", blobs: [await pdfToPptx(file, onProgress)] };
  return { format: pdfFormat, blobs: await pdfToImages(file, pdfFormat, onProgress) };
}

// ---------------------------------------------------------------------------
// 다운로드 / 미리보기
// ---------------------------------------------------------------------------
// 결과 파일 이름. ZIP 입력은 원래 파일 이름을, 그 밖에는 "제목-1.png"처럼 번호를 붙인다.
function outputFileNames(record) {
  if (record.outputNames) return record.outputNames;
  if (record.outputs.length === 1) return [`${record.title}.${record.format}`];
  return record.outputs.map((_, index) => `${record.title}-${index + 1}.${record.format}`);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// 결과가 한 개면 그 파일을, 여러 개면 ZIP 하나로 묶어 내려받는다.
async function downloadRecord(record) {
  const names = outputFileNames(record);
  if (record.outputs.length === 1) {
    downloadBlob(record.outputs[0], `${record.title}.${getExtension(names[0]) || record.format}`);
    return;
  }
  const zip = new JSZip();
  record.outputs.forEach((blob, index) => zip.file(names[index], blob));
  downloadBlob(await zip.generateAsync({ type: "blob", mimeType: "application/zip" }), `${record.title}.zip`);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const elements = {
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  queue: document.querySelector("#queue"),
  queueEmpty: document.querySelector("#queue-empty"),
  convert: document.querySelector("#convert"),
  clearQueue: document.querySelector("#clear-queue"),
  notice: document.querySelector("#notice"),
  records: document.querySelector("#records"),
  recordCount: document.querySelector("#record-count"),
  recordSize: document.querySelector("#record-size"),
  empty: document.querySelector("#empty"),
  search: document.querySelector("#search"),
  filter: document.querySelector("#filter"),
  clearLibrary: document.querySelector("#clear-library"),
  previewDialog: document.querySelector("#preview-dialog"),
  previewTitle: document.querySelector("#preview-title"),
  previewBody: document.querySelector("#preview-body"),
  editDialog: document.querySelector("#edit-dialog"),
  editForm: document.querySelector("#edit-form"),
  editTitle: document.querySelector("#edit-title"),
  editMemo: document.querySelector("#edit-memo"),
};

let records = [];
let editingId = null;
let previewUrls = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick) {
  const node = element("button", "", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function cell(content, className) {
  const node = element("td", className);
  if (content instanceof Node) node.append(content);
  else node.textContent = content;
  return node;
}

// ---------------------------------------------------------------------------
// 변환 목록: 파일마다 바꿀 형식을 고르고 [Convert]. 결과는 보관함에 쌓인다.
// ---------------------------------------------------------------------------
const PDF_TARGETS = [["docx", "Word"], ["pptx", "PowerPoint"], ["png", "PNG"], ["jpg", "JPG"], ["txt", "Text"]];
let queue = [];
let converting = Promise.resolve();
let isConverting = false;
// 새로 추가하는 PDF의 기본 형식. 사용자가 마지막으로 고른 형식을 따른다.
let defaultPdfTarget = "docx";

function targetCell(item) {
  const kind = getFileKind(item.file.name);
  if (kind === "unsupported") return cell("—", "meta");
  if (kind !== "pdf") return cell(kind === "archive" ? "PDF (photos combined)" : "PDF");
  const select = element("select");
  select.setAttribute("aria-label", `Convert ${item.file.name} to`);
  for (const [value, label] of PDF_TARGETS) select.append(new Option(label, value, false, value === item.format));
  select.disabled = item.state === "converting";
  select.addEventListener("change", () => {
    item.format = defaultPdfTarget = select.value;
    // 형식을 바꾸면 새로 변환할 준비 상태로 돌아간다.
    if (item.state !== "pending") Object.assign(item, { state: "pending", message: "", record: null });
    renderQueue();
  });
  return cell(select);
}

function statusCell(item) {
  const node = element("td", { done: "success", error: "error" }[item.state] ?? "meta");
  if (item.state === "done") {
    node.append("✓ Saved · ");
    const link = button("Download", () => downloadRecord(item.record));
    link.className = "link";
    node.append(link);
  } else {
    node.textContent = item.message;
  }
  return node;
}

function renderQueue() {
  elements.queue.replaceChildren(
    ...queue.map((item) => {
      const row = element("tr");
      const name = element("td");
      name.append(element("div", "", item.file.name), element("div", "meta", formatSize(item.file.size)));
      row.append(name, targetCell(item), statusCell(item));

      const actions = element("td");
      if (getFileKind(item.file.name) !== "unsupported") {
        const convertButton = button("Convert", () => convertOne(item));
        convertButton.disabled = item.state === "converting";
        actions.append(convertButton);
      }
      const remove = button("✕", () => {
        queue = queue.filter((entry) => entry !== item);
        renderQueue();
      });
      remove.className = "link";
      remove.title = "Remove from list";
      remove.setAttribute("aria-label", `Remove ${item.file.name}`);
      remove.disabled = item.state === "converting";
      actions.append(remove);
      row.append(actions);
      return row;
    }),
  );
  const pending = queue.filter((item) => item.state === "pending").length;
  elements.queueEmpty.hidden = queue.length > 0;
  elements.convert.disabled = isConverting || pending === 0;
  elements.convert.textContent = pending > 0 ? `Convert all (${pending})` : "Convert all";
  elements.clearQueue.disabled = isConverting || queue.length === 0;
}

function enqueueFiles(fileList) {
  const files = [...fileList];
  if (files.length === 0) return;
  for (const file of files) {
    const supported = getFileKind(file.name) !== "unsupported";
    queue.push({
      file,
      // PDF가 아닌 파일은 언제나 PDF가 되므로 이 값을 쓰지 않는다(ZIP 안의 PDF에만 쓰인다).
      format: defaultPdfTarget,
      state: supported ? "pending" : "error",
      message: supported ? "" : "Unsupported file type",
      record: null,
    });
  }
  elements.notice.textContent = "";
  renderQueue();
}

// Create: 변환 후 보관함에 저장
function startConversion() {
  converting = converting.then(() => convertItems(queue.filter((item) => item.state === "pending")));
  return converting;
}

// 한 파일만 변환한다. 이미 끝난 파일을 다시 누르면 지금 고른 형식으로 새 결과가 보관함에 하나 더 생긴다.
function convertOne(item) {
  if (item.state !== "pending") Object.assign(item, { state: "pending", message: "", record: null });
  renderQueue();
  converting = converting.then(() => convertItems([item]));
  return converting;
}

async function convertItems(items) {
  const targets = items.filter((item) => item.state === "pending" && queue.includes(item));
  if (targets.length === 0) return;
  isConverting = true;
  let failed = 0;
  for (const item of targets) {
    // 앞선 변환을 기다리는 동안 다른 경로로 이미 처리됐거나 목록에서 빠졌으면 건너뛴다.
    if (item.state !== "pending" || !queue.includes(item)) continue;
    item.state = "converting";
    item.message = "Converting…";
    renderQueue();
    try {
      const { format, blobs, names } = await convert(item.file, item.format, (message) => {
        item.message = message;
        renderQueue();
      });
      const now = Date.now();
      const record = {
        id: newId(),
        title: getStem(item.file.name),
        memo: "",
        sourceName: item.file.name,
        sourceSize: item.file.size,
        // 원본 파일도 함께 저장해, 나중에 다시 올리지 않고 다른 형식으로 바꿀 수 있게 한다.
        source: item.file,
        format,
        outputs: blobs,
        outputNames: names ?? null,
        outputSize: blobs.reduce((sum, blob) => sum + blob.size, 0),
        createdAt: now,
        updatedAt: now,
      };
      await recordStore.create(record);
      Object.assign(item, { state: "done", message: "", record });
      await reloadRecords();
    } catch (error) {
      Object.assign(item, { state: "error", message: error instanceof Error ? error.message : String(error) });
      failed += 1;
    }
    renderQueue();
  }
  isConverting = false;
  elements.notice.textContent = failed ? `${failed} file(s) failed. See the list above.` : "";
  renderQueue();
}

// ---------------------------------------------------------------------------
// 보관함
// ---------------------------------------------------------------------------

function linkButton(label, onClick, extraClass = "") {
  const node = button(label, onClick);
  node.className = `link ${extraClass}`.trim();
  return node;
}

// Read: 보관함 목록 렌더링 (검색·필터 포함). 한 줄 = 이름·메모·요약 정보 + [Download]와 작은 링크들.
function renderRecords() {
  const query = elements.search.value.trim().toLowerCase();
  const format = elements.filter.value;
  const visible = records.filter((record) => {
    if (format && record.format !== format) return false;
    if (!query) return true;
    return [record.title, record.memo, record.sourceName].some((value) => value.toLowerCase().includes(query));
  });

  elements.recordCount.textContent = String(records.length);
  const totalSize = records.reduce((sum, record) => sum + record.outputSize, 0);
  elements.recordSize.textContent = records.length ? formatSize(totalSize) : "";
  elements.empty.hidden = visible.length > 0;
  elements.empty.textContent = records.length ? "No matching files." : "No converted files yet.";

  elements.records.replaceChildren(
    ...visible.map((record) => {
      const row = element("tr");
      const info = element("td");
      const count = record.outputs.length > 1 ? ` · ${record.outputs.length} files` : "";
      info.append(element("div", "record-name", `${record.title}.${record.format}`));
      if (record.memo) info.append(element("div", "memo", record.memo));
      const edited = record.updatedAt !== record.createdAt ? " · edited" : "";
      info.append(element("div", "meta", `from ${record.sourceName} · ${formatSize(record.outputSize)}${count} · ${formatDate(record.createdAt)}${edited}`));

      const actions = element("td");
      actions.append(button("Download", () => downloadRecord(record)));
      const links = element("div", "links");
      links.append(linkButton("View", () => openPreview(record)));
      // 원본이 저장된 기록은 다시 올리지 않고 변환 목록에 다시 넣을 수 있다.
      if (record.source) links.append(linkButton("Convert again", () => reuseSource(record)));
      links.append(linkButton("Edit", () => openEditor(record)), linkButton("Delete", () => deleteRecord(record), "danger"));
      actions.append(links);
      row.append(info, actions);
      return row;
    }),
  );
  elements.clearLibrary.disabled = records.length === 0;
}

// 보관함의 원본을 변환 목록에 다시 넣는다. 같은 파일이 이미 목록에 있으면 새로 넣지 않고 그 줄을 보여준다.
function reuseSource(record) {
  let item = queue.find((entry) => entry.file.name === record.sourceName && entry.file.size === record.sourceSize);
  if (!item) {
    enqueueFiles([new File([record.source], record.sourceName, { type: record.source.type })]);
    item = queue.at(-1);
  }
  const index = queue.indexOf(item);
  const row = elements.queue.rows[index];
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
  row?.classList.add("highlight");
  setTimeout(() => row?.classList.remove("highlight"), 1500);
  elements.notice.textContent = getFileKind(record.sourceName) === "pdf" ? "Pick a format in the list, then click Convert." : "";
}

// Delete: 보관함 전체 비우기
async function clearLibrary() {
  if (records.length === 0) return;
  if (!confirm(`Delete all ${records.length} file(s) from the Library? This cannot be undone.`)) return;
  await recordStore.clear();
  elements.notice.textContent = "The Library is now empty.";
  await reloadRecords();
}

async function reloadRecords() {
  records = (await recordStore.list()).sort((a, b) => b.createdAt - a.createdAt);
  renderRecords();
}

function closePreview() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  elements.previewBody.replaceChildren();
}

const MAX_PREVIEW_FILES = 20;

async function previewOutput(blob, name) {
  const format = getExtension(name);
  if (format === "txt") return element("pre", "", (await blob.text()).replace(/^﻿/, ""));
  if (format === "png" || format === "jpg") {
    const image = element("img");
    image.src = URL.createObjectURL(blob);
    image.alt = name;
    previewUrls.push(image.src);
    return image;
  }
  let pdf = blob;
  if (format === "docx" || format === "pptx") {
    // 브라우저는 DOCX·PPTX를 직접 보여주지 못하므로, 문서 변환기로 PDF를 만들어 보여준다.
    pdf = await DOCUMENT_CONVERTERS[format](new File([blob], name), () => {});
  }
  const frame = element("iframe");
  frame.src = URL.createObjectURL(pdf);
  frame.title = name;
  previewUrls.push(frame.src);
  return frame;
}

async function openPreview(record) {
  closePreview();
  const names = outputFileNames(record);
  elements.previewTitle.textContent = record.outputs.length > 1 ? `${record.title} (${record.outputs.length} files)` : names[0];
  elements.previewBody.append(element("p", "hint", "Loading preview…"));
  elements.previewDialog.showModal();

  const nodes = [];
  const showNames = record.outputs.length > 1;
  for (const [index, blob] of record.outputs.slice(0, MAX_PREVIEW_FILES).entries()) {
    if (showNames) nodes.push(element("strong", "", names[index]));
    nodes.push(await previewOutput(blob, names[index]));
  }
  if (record.outputs.length > MAX_PREVIEW_FILES) {
    nodes.push(element("p", "hint", `Showing the first ${MAX_PREVIEW_FILES} files. Download to see all.`));
  }
  if (elements.previewDialog.open) elements.previewBody.replaceChildren(...nodes);
}

// Update: 이름·메모 수정
function openEditor(record) {
  editingId = record.id;
  elements.editTitle.value = record.title;
  elements.editMemo.value = record.memo;
  elements.editDialog.showModal();
  elements.editTitle.select();
}

async function saveEditor() {
  const record = await recordStore.get(editingId);
  if (!record) return;
  const title = elements.editTitle.value.trim().replace(/[\\/:*?"<>|]/g, "_");
  if (!title) return;
  record.title = title;
  record.memo = elements.editMemo.value.trim();
  record.updatedAt = Date.now();
  await recordStore.update(record);
  elements.notice.textContent = `Saved "${title}".`;
  await reloadRecords();
}

// Delete
async function deleteRecord(record) {
  if (!confirm(`Delete "${record.title}.${record.format}" from the Library?`)) return;
  await recordStore.remove(record.id);
  elements.notice.textContent = `Deleted "${record.title}".`;
  await reloadRecords();
}

// ---------------------------------------------------------------------------
// 이벤트 연결
// ---------------------------------------------------------------------------
elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});
elements.fileInput.addEventListener("change", () => {
  enqueueFiles(elements.fileInput.files);
  elements.fileInput.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
}
elements.dropZone.addEventListener("drop", (event) => enqueueFiles(event.dataTransfer.files));
// 드롭 영역 밖에 떨어뜨려도 브라우저가 파일을 열어버리지 않게 막는다.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

elements.convert.addEventListener("click", startConversion);
elements.clearQueue.addEventListener("click", () => {
  queue = [];
  elements.notice.textContent = "";
  renderQueue();
});

elements.search.addEventListener("input", renderRecords);
elements.filter.addEventListener("change", renderRecords);
elements.clearLibrary.addEventListener("click", clearLibrary);

for (const dialog of [elements.previewDialog, elements.editDialog]) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-close]")) dialog.close();
  });
}
elements.previewDialog.addEventListener("close", closePreview);
elements.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveEditor().then(() => elements.editDialog.close());
});

pdfjsLib.GlobalWorkerOptions.workerSrc = "./lib/pdf.worker.min.js";
renderQueue();
reloadRecords().catch((error) => {
  elements.notice.textContent = `Could not open the Library: ${error.message}`;
});
