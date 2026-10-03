import { spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BrowserWindow, session } from "electron";

import { getFileKind, getOutputName } from "./file-types.js";

const IMAGE_MIME_TYPES = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let printSession;

function getPrintSession() {
  if (printSession) return printSession;
  printSession = session.fromPartition("drop-pdf-print", { cache: false });
  printSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true }),
  );
  return printSession;
}

function printableDocument(title, content, extraStyles = "") {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body { color: #17231f; font-family: "Malgun Gothic", "Noto Sans KR", sans-serif; }
      ${extraStyles}
    </style>
  </head>
  <body>${content}</body>
</html>`;
}

async function printUrlToPdf(url, outputPath) {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      sandbox: true,
      session: getPrintSession(),
    },
  });

  try {
    await printWindow.loadURL(url);
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margins: {
        top: 0.4,
        bottom: 0.4,
        left: 0.4,
        right: 0.4,
      },
    });
    await writeFile(outputPath, pdf);
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

async function convertImage(inputPath, outputPath) {
  const extension = path.extname(inputPath).toLowerCase();
  const contents = await readFile(inputPath);
  const source = `data:${IMAGE_MIME_TYPES[extension]};base64,${contents.toString("base64")}`;
  const html = printableDocument(
    path.basename(inputPath),
    `<main><img src="${source}" alt=""></main>`,
    "main { min-height: calc(297mm - 28mm); display: grid; place-items: center; } img { display: block; max-width: 100%; max-height: calc(297mm - 28mm); object-fit: contain; }",
  );
  await printUrlToPdf(`data:text/html;base64,${Buffer.from(html).toString("base64")}`, outputPath);
}

async function convertText(inputPath, outputPath) {
  const contents = await readFile(inputPath, "utf8");
  const html = printableDocument(
    path.basename(inputPath),
    `<pre>${escapeHtml(contents)}</pre>`,
    "pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 10.5pt/1.65 Consolas, \"Malgun Gothic\", monospace; }",
  );
  await printUrlToPdf(`data:text/html;base64,${Buffer.from(html).toString("base64")}`, outputPath);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function nextAvailablePath(directory, fileName) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let index = 1;

  while (await fileExists(candidate)) {
    candidate = path.join(directory, `${stem} (${index})${extension}`);
    index += 1;
  }

  return candidate;
}

async function findLibreOffice() {
  const candidates = [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "LibreOffice", "program", "soffice.exe"),
    process.env["ProgramFiles(x86)"] &&
      path.join(process.env["ProgramFiles(x86)"], "LibreOffice", "program", "soffice.exe"),
    ...String(process.env.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, process.platform === "win32" ? "soffice.exe" : "soffice")),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

function runProcess(command, argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, { windowsHide: true });
    let errorOutput = "";

    child.stderr.on("data", (chunk) => {
      errorOutput += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `변환 도구가 코드 ${code}(으)로 종료되었습니다.`));
    });
  });
}

async function convertOffice(inputPath, outputPath) {
  const executable = await findLibreOffice();
  if (!executable) throw new Error("Office 문서를 변환하려면 LibreOffice가 필요합니다.");

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "drop-pdf-"));
  try {
    await runProcess(executable, ["--headless", "--convert-to", "pdf", "--outdir", temporaryDirectory, inputPath]);
    const generatedPath = path.join(temporaryDirectory, getOutputName(inputPath));
    if (!(await fileExists(generatedPath))) throw new Error("LibreOffice가 PDF 파일을 만들지 못했습니다.");
    await copyFile(generatedPath, outputPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function getCapabilities() {
  return { office: Boolean(await findLibreOffice()) };
}

export async function convertFile(inputPath, requestedDirectory) {
  const kind = getFileKind(inputPath);
  if (kind === "unsupported") throw new Error("지원하지 않는 파일 형식입니다.");

  const fileStats = await stat(inputPath);
  if (!fileStats.isFile()) throw new Error("일반 파일만 변환할 수 있습니다.");
  if (fileStats.size > 200 * 1024 * 1024) throw new Error("파일 크기는 200MB 이하여야 합니다.");

  const outputDirectory = requestedDirectory || path.dirname(inputPath);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = await nextAvailablePath(outputDirectory, getOutputName(inputPath));

  try {
    if (kind === "image") await convertImage(inputPath, outputPath);
    if (kind === "text") await convertText(inputPath, outputPath);
    if (kind === "html") await printUrlToPdf(pathToFileURL(inputPath).href, outputPath);
    if (kind === "office") await convertOffice(inputPath, outputPath);
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }

  return outputPath;
}
