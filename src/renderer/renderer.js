const supportedExtensions = new Set([
  "bmp", "gif", "jpeg", "jpg", "png", "webp",
  "log", "md", "text", "txt", "htm", "html",
  "doc", "docx", "odp", "ods", "odt", "ppt", "pptx", "rtf", "xls", "xlsx",
]);

const state = {
  files: [],
  outputDirectory: null,
  converting: false,
  revealAfterConversion: false,
};
const dropZone = document.querySelector("#drop-zone");
const selectFilesButton = document.querySelector("#select-files");
const queuePanel = document.querySelector("#queue-panel");
const fileList = document.querySelector("#file-list");
const fileCount = document.querySelector("#file-count");
const clearFilesButton = document.querySelector("#clear-files");
const outputButton = document.querySelector("#select-output");
const outputLabel = document.querySelector("#output-label");
const convertButton = document.querySelector("#convert");
const notice = document.querySelector("#notice");
const officeStatus = document.querySelector("#office-status");

function extensionOf(filePath) {
  const name = filePath.split(/[\\/]/).pop() ?? "";
  return name.includes(".") ? name.split(".").pop().toLowerCase() : "";
}

function nameOf(filePath) {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function readableSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function addFiles(entries) {
  const existing = new Set(state.files.map((file) => file.path.toLowerCase()));
  let unsupported = 0;
  let added = 0;

  for (const entry of entries) {
    const extension = extensionOf(entry.path);
    if (!supportedExtensions.has(extension)) {
      unsupported += 1;
      continue;
    }
    if (existing.has(entry.path.toLowerCase())) continue;
    state.files.push({
      path: entry.path,
      name: entry.name || nameOf(entry.path),
      size: entry.size,
      extension,
      status: "대기 중",
      outputPath: null,
      error: false,
      processed: false,
    });
    existing.add(entry.path.toLowerCase());
    added += 1;
  }

  notice.textContent = unsupported > 0 ? `지원하지 않는 파일 ${unsupported}개는 제외했습니다.` : "";
  render();
  return added;
}

function render() {
  const pendingCount = state.files.filter((file) => !file.outputPath).length;
  queuePanel.hidden = state.files.length === 0;
  fileCount.textContent = String(state.files.length);
  convertButton.disabled = pendingCount === 0 || state.converting;
  convertButton.querySelector("span:first-child").textContent = state.converting
    ? "변환 중…"
    : `PDF로 변환${pendingCount ? ` (${pendingCount})` : ""}`;

  fileList.replaceChildren();
  for (const file of state.files) {
    const item = document.createElement("li");
    item.className = "file-item";
    const type = document.createElement("span");
    type.className = "file-type";
    type.textContent = file.extension || "file";
    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = file.name;
    name.title = file.path;
    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = readableSize(file.size);
    details.append(name, meta);
    const status = document.createElement("span");
    status.className = `file-status${file.outputPath ? " success" : ""}${file.error ? " error" : ""}`;
    status.textContent = file.outputPath ? "완료 · 위치 열기" : file.status;
    status.title = file.error ? file.status : file.outputPath || "";
    if (file.outputPath) status.addEventListener("click", () => window.dropPdf.showFile(file.outputPath));
    item.append(type, details, status);
    fileList.append(item);
  }
}

async function chooseFiles() {
  const paths = await window.dropPdf.selectFiles();
  addFiles(paths.map((filePath) => ({ path: filePath, name: nameOf(filePath) })));
}

selectFilesButton.addEventListener("click", (event) => {
  event.stopPropagation();
  chooseFiles();
});
dropZone.addEventListener("click", chooseFiles);
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") chooseFiles();
});

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
}

dropZone.addEventListener("drop", async (event) => {
  const entries = [...event.dataTransfer.files].map((file) => ({
    path: window.dropPdf.getPathForFile(file),
    name: file.name,
    size: file.size,
  }));
  const added = addFiles(entries);
  if (added > 0) {
    notice.textContent = `${added}개 파일을 받았습니다. 바로 변환합니다.`;
    await convertPendingFiles({ revealOnComplete: true });
  }
});

clearFilesButton.addEventListener("click", () => {
  if (state.converting) return;
  state.files = [];
  notice.textContent = "";
  render();
});

outputButton.addEventListener("click", async () => {
  const directory = await window.dropPdf.selectOutputDirectory();
  if (!directory) return;
  state.outputDirectory = directory;
  outputLabel.textContent = directory;
});

async function convertPendingFiles({ revealOnComplete = false } = {}) {
  state.revealAfterConversion ||= revealOnComplete;
  if (state.converting) return;

  state.converting = true;
  notice.textContent = "파일을 PDF로 변환하고 있습니다.";
  let succeeded = 0;
  let failed = 0;
  let lastOutputPath = null;

  while (true) {
    const file = state.files.find((candidate) => !candidate.outputPath && !candidate.processed);
    if (!file) break;

    file.processed = true;
    file.status = "변환 중…";
    file.error = false;
    render();
    try {
      file.outputPath = await window.dropPdf.convertFile(file.path, state.outputDirectory);
      file.status = "완료";
      lastOutputPath = file.outputPath;
      succeeded += 1;
    } catch (error) {
      file.error = true;
      file.status = error instanceof Error ? error.message : String(error);
      failed += 1;
    }
    render();
  }

  state.converting = false;
  notice.textContent = `${succeeded}개 변환 완료${failed ? ` · ${failed}개 실패` : ""}`;
  render();

  if (state.revealAfterConversion && lastOutputPath) {
    state.revealAfterConversion = false;
    await window.dropPdf.showFile(lastOutputPath);
  } else {
    state.revealAfterConversion = false;
  }
}

convertButton.addEventListener("click", async () => {
  for (const file of state.files) {
    if (!file.outputPath) file.processed = false;
  }
  await convertPendingFiles();
});

window.dropPdf.getCapabilities().then(({ office }) => {
  officeStatus.textContent = office ? "Office 문서 변환 사용 가능" : "Office 문서는 LibreOffice 설치 시 지원";
});

render();
