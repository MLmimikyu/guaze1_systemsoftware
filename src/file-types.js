import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

export const TEXT_EXTENSIONS = new Set([".log", ".md", ".text", ".txt"]);
export const HTML_EXTENSIONS = new Set([".htm", ".html"]);
export const OFFICE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".odp",
  ".ods",
  ".odt",
  ".ppt",
  ".pptx",
  ".rtf",
  ".xls",
  ".xlsx",
]);

export const SUPPORTED_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  ...HTML_EXTENSIONS,
  ...OFFICE_EXTENSIONS,
]);

export const PDF_OUTPUT_EXTENSIONS = new Set(["png", "jpg", "txt"]);

export function getFileKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if (HTML_EXTENSIONS.has(extension)) return "html";
  if (OFFICE_EXTENSIONS.has(extension)) return "office";
  return "unsupported";
}

export function getOutputName(filePath) {
  const extension = path.extname(filePath);
  return `${path.basename(filePath, extension)}.pdf`;
}

export function getConvertedOutputName(filePath, outputFormat) {
  const normalizedFormat = String(outputFormat).toLowerCase();
  if (!PDF_OUTPUT_EXTENSIONS.has(normalizedFormat)) {
    throw new Error("지원하지 않는 PDF 출력 형식입니다.");
  }
  return `${path.basename(filePath, path.extname(filePath))}.${normalizedFormat}`;
}
