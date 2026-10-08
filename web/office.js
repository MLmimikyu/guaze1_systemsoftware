"use strict";

// ---------------------------------------------------------------------------
// HTML·Office·OpenDocument·RTF 문서를 브라우저 안에서 PDF로 변환한다.
//
// 모든 문서는 같은 경로를 거친다:
//   문서 → HTML 문자열 → 화면 밖 iframe(sandbox, 네트워크 차단 CSP) → html2canvas → jsPDF
// ---------------------------------------------------------------------------

const CSS_PX_PER_MM = 96 / 25.4;
const CAPTURE_SCALE = 2;
const MAX_CAPTURE_HEIGHT_PX = 6000;
const MAX_DOCUMENT_PAGES = 500;
const SLIDE_WIDTH_PX = 960;
const FRAME_CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:";
const DOCUMENT_FONT = `"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;

const BASE_CSS = `
  html, body { margin: 0; background: #fff; color: #1d1d1d; }
  body { font: 11pt/1.55 ${DOCUMENT_FONT}; overflow-wrap: anywhere; }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
`;

const DOCUMENT_CSS = `
  p { margin: 0 0 0.45em; min-height: 1em; }
  h1, h2, h3, h4, h5, h6 { margin: 0.6em 0 0.4em; line-height: 1.3; }
  td, th { border: 1px solid #9a9a9a; padding: 4px 6px; vertical-align: top; }
  td p, th p { margin: 0; }
  ul, ol { margin: 0 0 0.45em; padding-left: 1.6em; }
`;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function createDocumentHtml(body, css = "") {
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">`
    + `<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

// ---------------------------------------------------------------------------
// 렌더링: HTML → 화면 밖 iframe → 페이지별 이미지 → PDF
// ---------------------------------------------------------------------------
function loadFrame(html, widthPx) {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    // allow-scripts가 없으므로 문서 안의 스크립트는 실행되지 않는다.
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-30000px;top:0;width:${widthPx}px;height:400px;border:0;`;
    frame.addEventListener("load", () => resolve(frame), { once: true });
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

async function waitForResources(doc) {
  await Promise.all(
    [...doc.images].map((image) =>
      image.complete ? null : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      }),
    ),
  );
  await doc.fonts?.ready;
}

// 텍스트 줄, 그림, 표의 행처럼 페이지 경계에서 잘리면 안 되는 세로 구간들.
function collectUnbreakableRanges(doc) {
  const ranges = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  while (walker.nextNode()) {
    if (!walker.currentNode.nodeValue.trim()) continue;
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.height > 0) ranges.push([rect.top, rect.bottom]);
    }
  }
  for (const node of doc.body.querySelectorAll("img, svg, canvas, tr, li")) {
    const rect = node.getBoundingClientRect();
    if (rect.height > 0) ranges.push([rect.top, rect.bottom]);
  }
  return ranges;
}

// [start, end] 구간을 pageHeight 높이의 페이지로 나눈다. 텍스트 줄이나 표의 행 중간이 잘리지 않는 위치를 고른다.
function findPageBreaks(doc, end, pageHeight, { start = 0, ranges = collectUnbreakableRanges(doc) } = {}) {
  const blocked = ranges.filter(([top, bottom]) => bottom - top < pageHeight && bottom > start && top < end);
  const isSafe = (y) => !blocked.some(([top, bottom]) => top < y - 0.5 && bottom > y + 0.5);
  const candidates = [...new Set(blocked.map(([, bottom]) => Math.ceil(bottom)))].sort((a, b) => a - b);
  const breaks = [start];
  while (end - start > pageHeight + 1) {
    const limit = start + pageHeight;
    let cut = limit;
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (candidate > limit) continue;
      if (candidate <= start + pageHeight * 0.5) break;
      if (isSafe(candidate)) {
        cut = candidate;
        break;
      }
    }
    breaks.push(cut);
    start = cut;
    if (breaks.length > MAX_DOCUMENT_PAGES) throw new Error(`Documents longer than ${MAX_DOCUMENT_PAGES} pages are not supported.`);
  }
  breaks.push(Math.max(end, start + 1));
  return breaks;
}

// 화면 영역들을 PDF 페이지로 찍는다. page = { x, y, width, height (CSS px), pageWidthMm, pageHeightMm, marginMm }.
// 페이지마다 크기·방향이 달라도 되고, 위아래로 이어진 페이지는 한 번에 찍어 잘라 쓴다.
async function capturePages(doc, pages, onProgress) {
  const root = doc.documentElement;
  const windowWidth = Math.max(root.scrollWidth, doc.body.scrollWidth);
  const windowHeight = Math.max(root.scrollHeight, doc.body.scrollHeight, 1);
  let pdf = null;

  for (let first = 0; first < pages.length;) {
    const head = pages[first];
    let last = first + 1;
    while (last < pages.length
      && pages[last].x === head.x
      && pages[last].width === head.width
      && Math.abs(pages[last].y - (pages[last - 1].y + pages[last - 1].height)) < 1
      && pages[last].y + pages[last].height - head.y <= MAX_CAPTURE_HEIGHT_PX) last += 1;
    onProgress(`Rendering page ${first + 1}/${pages.length}…`);

    const captureHeight = pages[last - 1].y + pages[last - 1].height - head.y;
    const canvas = await html2canvas(root, {
      backgroundColor: "#ffffff",
      scale: CAPTURE_SCALE,
      x: head.x,
      y: head.y,
      width: head.width,
      height: captureHeight,
      windowWidth,
      windowHeight,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      useCORS: false,
    });
    const ratio = canvas.width / head.width;

    for (let index = first; index < last; index += 1) {
      const page = pages[index];
      const sliceHeight = Math.max(1, Math.round(page.height * ratio));
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, Math.round((page.y - head.y) * ratio), slice.width, sliceHeight, 0, 0, slice.width, sliceHeight);

      const orientation = page.pageWidthMm > page.pageHeightMm ? "landscape" : "portrait";
      const format = [page.pageWidthMm, page.pageHeightMm];
      if (pdf) pdf.addPage(format, orientation);
      else pdf = new jspdf.jsPDF({ unit: "mm", format, orientation });
      const boxWidth = page.pageWidthMm - page.marginMm * 2;
      const boxHeight = page.pageHeightMm - page.marginMm * 2;
      const imageHeight = Math.min(boxHeight, (boxWidth * slice.height) / slice.width);
      pdf.addImage(slice.toDataURL("image/jpeg", 0.85), "JPEG", page.marginMm, page.marginMm, boxWidth, imageHeight);
    }
    first = last;
  }
  return pdf.output("blob");
}

async function frameToPdf(frame, options) {
  const {
    pageWidthMm = 210,
    pageHeightMm = 297,
    marginMm = 12,
    slideHeightPx = null,
    allowLandscape = false,
    onProgress = () => {},
  } = options;
  const doc = frame.contentDocument;
  const root = doc.documentElement;
  await waitForResources(doc);

  let contentWidth = Math.max(frame.clientWidth, root.scrollWidth, doc.body.scrollWidth);
  let pageWidth = pageWidthMm;
  let pageHeight = pageHeightMm;
  if (allowLandscape && contentWidth > frame.clientWidth * 1.05) [pageWidth, pageHeight] = [pageHeightMm, pageWidthMm];
  frame.style.width = `${contentWidth}px`;
  contentWidth = Math.max(contentWidth, root.scrollWidth);

  const boxWidth = pageWidth - marginMm * 2;
  const boxHeight = pageHeight - marginMm * 2;
  const pageHeightPx = slideHeightPx ?? Math.floor((contentWidth * boxHeight) / boxWidth);
  frame.style.height = `${Math.max(root.scrollHeight, doc.body.scrollHeight)}px`;
  const totalHeight = Math.max(root.scrollHeight, doc.body.scrollHeight, 1);

  let breaks;
  if (slideHeightPx) {
    const count = Math.max(1, Math.round(totalHeight / slideHeightPx));
    breaks = Array.from({ length: count + 1 }, (_, index) => index * slideHeightPx);
  } else {
    breaks = findPageBreaks(doc, totalHeight, pageHeightPx);
  }

  const pages = breaks.slice(0, -1).map((top, index) => ({
    x: 0,
    y: top,
    width: contentWidth,
    height: breaks[index + 1] - top,
    pageWidthMm: pageWidth,
    pageHeightMm: pageHeight,
    marginMm,
  }));
  return capturePages(doc, pages, onProgress);
}

async function renderHtmlToPdf(html, { widthPx, prepare, ...options }) {
  const frame = await loadFrame(html, widthPx);
  try {
    if (prepare) await prepare(frame.contentDocument);
    return await frameToPdf(frame, options);
  } finally {
    frame.remove();
  }
}

function a4WidthPx(marginMm) {
  return Math.round((210 - marginMm * 2) * CSS_PX_PER_MM);
}

function renderDocument(bodyHtml, onProgress, css = DOCUMENT_CSS) {
  return renderHtmlToPdf(createDocumentHtml(bodyHtml, css), { widthPx: a4WidthPx(18), marginMm: 18, onProgress });
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
function sanitizeHtmlDocument(source) {
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script, iframe, frame, frameset, object, embed, base, link, meta[http-equiv]").forEach((node) => node.remove());
  for (const node of doc.querySelectorAll("*")) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || /^\s*javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
    }
  }
  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = FRAME_CSP;
  doc.head.prepend(policy);
  const background = doc.createElement("style");
  background.textContent = "html { background: #fff; }";
  doc.head.prepend(background);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

async function htmlToPdf(file, onProgress) {
  const html = sanitizeHtmlDocument(await readText(file));
  return renderHtmlToPdf(html, { widthPx: 794, marginMm: 12, onProgress });
}

// ---------------------------------------------------------------------------
// 압축(ZIP) 기반 문서 공통 도우미 — DOCX·PPTX·ODT·ODP
// ---------------------------------------------------------------------------
const ZIP_IMAGE_MIME = {
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Could not read the document's internal XML.");
  return doc;
}

function kids(node, name) {
  return node ? [...node.children].filter((child) => child.localName === name) : [];
}

function kid(node, name) {
  return node ? [...node.children].find((child) => child.localName === name) ?? null : null;
}

function descendants(node, name) {
  return node ? [...node.getElementsByTagNameNS("*", name)] : [];
}

function attr(node, name) {
  return node?.getAttribute(name) ?? null;
}

async function openZip(file, label) {
  try {
    return await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(`Could not open the ${label} file. It may be damaged or password-protected.`);
  }
}

async function zipXml(zip, path) {
  const entry = path && zip.file(path);
  return entry ? parseXml(await entry.async("string")) : null;
}

async function zipImage(zip, path) {
  const entry = path && zip.file(path);
  const mime = ZIP_IMAGE_MIME[getExtension(path ?? "")];
  if (!entry || !mime) return null;
  return `data:${mime};base64,${await entry.async("base64")}`;
}

function resolvePartPath(fromPath, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = fromPath.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment && segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

async function zipRels(zip, partPath) {
  const slash = partPath.lastIndexOf("/");
  const relsPath = `${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`;
  const doc = await zipXml(zip, relsPath);
  const rels = {};
  for (const rel of descendants(doc, "Relationship")) {
    if (attr(rel, "TargetMode") === "External") continue;
    rels[attr(rel, "Id")] = { type: attr(rel, "Type") ?? "", target: resolvePartPath(partPath, attr(rel, "Target") ?? "") };
  }
  return rels;
}

function relTargetByType(rels, typeSuffix) {
  return Object.values(rels).find((rel) => rel.type.endsWith(`/${typeSuffix}`))?.target ?? null;
}

// ---------------------------------------------------------------------------
// DOCX (docx-preview 라이브러리로 HTML 렌더링)
// ---------------------------------------------------------------------------
// 각 section.docx는 문서의 실제 페이지 크기(가로·세로)로 그려진다.
// section은 떠 있는 개체의 기준 상자가 되고(position), 글자 뒤 개체(z-index:-1)가 흰 배경 위·글자 아래에 오도록 쌓임 맥락을 만든다.
const DOCX_CSS = `
  body { background: #fff; }
  section.docx { position: relative !important; z-index: 0; box-shadow: none !important; margin: 0 !important; background: #fff !important; }
  /* 줄 높이가 "정확히"로 정해진 문단(docx-preview가 min-height를 붙임): 글자 크기가 문단 기본 크기와 달라도 줄이 더 높아지지 않게 한다. */
  section.docx p[style*="min-height"] > span { vertical-align: top; }
  .docx-float { position: absolute; overflow: visible; }
  .docx-float.behind { z-index: -1; }
  .docx-float.front { z-index: 2; }
  .docx-float p { margin: 0; white-space: pre-wrap; }
  .docx-float p span { vertical-align: top; }
`;
const EMU_PER_CSS_PX = 9525;
const TAB_MARKER = "⁤";
const FLOAT_MARKER = "⁣";

function cssLengthToPx(value) {
  const match = /^(-?[\d.]+)(px|pt|cm|mm|in)?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1]) * { px: 1, pt: 96 / 72, cm: 96 / 2.54, mm: 96 / 25.4, in: 96 }[match[2] ?? "px"];
}

// 떠 있는 텍스트 상자 안의 문단을 간단한 HTML로 옮긴다(크기·굵게·기울임·색·줄 높이·들여쓰기·정렬).
function wordParagraphsToHtml(container) {
  return kids(container, "p").map((paragraph) => {
    const pPr = kid(paragraph, "pPr");
    const spacing = kid(pPr, "spacing");
    const indent = kid(pPr, "ind");
    const line = Number(attr(spacing, "w:line"));
    const css = [];
    if (line) css.push(["exact", "atLeast"].includes(attr(spacing, "w:lineRule")) ? `line-height:${line / 20}pt` : `line-height:${line / 240}`);
    const indentLeft = Number(attr(indent, "w:left") ?? 0) / 20;
    if (indentLeft) css.push(`padding-left:${indentLeft}pt`);
    if (attr(indent, "w:firstLine")) css.push(`text-indent:${Number(attr(indent, "w:firstLine")) / 20}pt`);
    const align = { center: "center", right: "right", end: "right", both: "justify" }[attr(kid(pPr, "jc"), "w:val")];
    if (align) css.push(`text-align:${align}`);

    // 탭 정지 위치(pt). 탭 뒤의 글은 다음 탭 정지 위치에 맞춰 놓는다(표의 칸·여러 단).
    const tabStops = kids(kid(pPr, "tabs"), "tab").map((tab) => Number(attr(tab, "w:pos")) / 20).sort((a, b) => a - b);
    const lines = [[""]];
    for (const run of kids(paragraph, "r")) {
      const rPr = kid(run, "rPr");
      const fonts = kid(rPr, "rFonts");
      const size = Number(attr(kid(rPr, "sz"), "w:val"));
      const color = attr(kid(rPr, "color"), "w:val");
      const style = [
        size ? `font-size:${size / 2}pt` : "",
        kid(rPr, "b") && attr(kid(rPr, "b"), "w:val") !== "0" ? "font-weight:700" : "",
        kid(rPr, "i") && attr(kid(rPr, "i"), "w:val") !== "0" ? "font-style:italic" : "",
        color && color !== "auto" ? `color:#${color}` : "",
        fonts ? `font-family:"${attr(fonts, "w:ascii") ?? "Arial"}","${attr(fonts, "w:eastAsia") ?? "Malgun Gothic"}",sans-serif` : "",
      ].filter(Boolean).join(";");
      for (const node of run.children) {
        const cells = lines.at(-1);
        if (node.localName === "t") cells[cells.length - 1] += `<span style="${style}">${escapeHtml(node.textContent)}</span>`;
        else if (node.localName === "br") lines.push([""]);
        else if (node.localName === "tab") cells.push("");
      }
    }
    const html = lines.map((cells) => {
      const parts = cells.map((cell, index) => {
        if (index === 0) return cell;
        const position = tabStops[index - 1];
        return position == null ? `&emsp;${cell}` : `<span style="position:absolute;left:${position - indentLeft}pt;top:0;white-space:pre">${cell}</span>`;
      });
      return `<span style="display:block;position:relative">${parts.join("") || "&#8203;"}</span>`;
    }).join("");
    return `<p style="${css.join(";")}">${html}</p>`;
  }).join("");
}

// docx-preview는 떠 있는 개체(wp:anchor)를 문단 안에 상대 위치로 그리거나(그림이 글자를 덮음), 텍스트 상자는 아예 빼 버린다.
// 그래서 렌더링 전에 떠 있는 개체를 모두 꺼내고 그 자리에 보이지 않는 표시 글자를 남긴 뒤, 렌더링 후 페이지 기준 위치에 직접 그린다.
async function extractFloatingObjects(data) {
  const zip = await JSZip.loadAsync(data);
  const documentPath = "word/document.xml";
  const xml = await zipXml(zip, documentPath);
  if (!xml) return { data, floats: [] };
  const rels = await zipRels(zip, documentPath);
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const floats = [];

  for (const anchor of descendants(xml, "anchor")) {
    const drawing = anchor.parentNode;
    const run = drawing?.parentNode;
    if (drawing?.localName !== "drawing" || run?.localName !== "r") continue;

    const extent = kid(anchor, "extent");
    const position = (axis) => {
      const node = kid(anchor, axis === "h" ? "positionH" : "positionV");
      return {
        from: attr(node, "relativeFrom") ?? "page",
        offset: Number(kid(node, "posOffset")?.textContent ?? 0) / EMU_PER_CSS_PX,
        align: kid(node, "align")?.textContent ?? null,
      };
    };
    const item = {
      id: floats.length,
      width: Number(attr(extent, "cx") ?? 0) / EMU_PER_CSS_PX,
      height: Number(attr(extent, "cy") ?? 0) / EMU_PER_CSS_PX,
      h: position("h"),
      v: position("v"),
      behind: attr(anchor, "behindDoc") === "1",
      image: null,
      html: null,
    };
    const blip = descendants(anchor, "blip")[0];
    const textBox = descendants(anchor, "txbxContent")[0];
    if (blip) item.image = await zipImage(zip, rels[attr(blip, "r:embed")]?.target);
    else if (textBox) item.html = wordParagraphsToHtml(textBox);
    if (!item.image && !item.html) continue;
    floats.push(item);

    // 개체가 있던 자리에 표시 글자(보이지 않는 문자 + 번호)를 남긴다.
    const marker = xml.createElementNS(W, "w:r");
    const text = xml.createElementNS(W, "w:t");
    text.textContent = `${FLOAT_MARKER}${item.id}${FLOAT_MARKER}`;
    marker.append(text);
    run.parentNode.replaceChild(marker, run);
  }

  // 탭: docx-preview는 탭 정지 위치를 무시하고(실험 기능은 iframe 안에서 위치를 잘못 계산함) 고정 폭 공백으로 그린다.
  // 그래서 본문의 탭마다 그 문단의 탭 정지 위치(pt)를 담은 표시 글자로 바꿔 두고, 렌더링 후 placeTabStops가 실제 간격을 만든다.
  // (떠 있는 텍스트 상자는 위에서 이미 꺼냈으므로 여기서는 본문 탭만 남아 있다.)
  let tabCount = 0;
  for (const tab of descendants(xml, "tab")) {
    if (tab.parentNode?.localName !== "r") continue;
    let paragraph = tab.parentNode;
    while (paragraph && paragraph.localName !== "p") paragraph = paragraph.parentNode;
    const stops = kids(kid(kid(paragraph, "pPr"), "tabs"), "tab")
      .filter((stop) => attr(stop, "w:val") !== "clear")
      .map((stop) => Number(attr(stop, "w:pos")) / 20)
      .filter((position) => Number.isFinite(position))
      .sort((a, b) => a - b);
    const text = xml.createElementNS(W, "w:t");
    text.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    text.textContent = `${TAB_MARKER}${stops.join(",")}${TAB_MARKER}`;
    tab.parentNode.replaceChild(text, tab);
    tabCount += 1;
  }

  if (floats.length === 0 && tabCount === 0) return { data, floats };
  zip.file(documentPath, new XMLSerializer().serializeToString(xml));
  return { data: await zip.generateAsync({ type: "arraybuffer" }), floats };
}

// 탭 표시 글자를 다음 탭 정지 위치까지 닿는 빈 칸으로 바꾼다. Word처럼 탭 위치는 페이지 왼쪽 여백(본문 시작)에서 잰다.
// 탭 정지가 없거나 다 지나갔으면 Word 기본값인 36pt 간격을 쓴다.
function placeTabStops(doc) {
  const pattern = new RegExp(`${TAB_MARKER}([\\d.,]*)${TAB_MARKER}`);
  const nodes = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.includes(TAB_MARKER)) nodes.push(walker.currentNode);
  }
  const spacers = [];
  for (let node of nodes) {
    let match = pattern.exec(node.nodeValue);
    while (match) {
      const markerNode = node.splitText(match.index);
      node = markerNode.splitText(match[0].length);
      const spacer = doc.createElement("span");
      spacer.style.cssText = "display:inline-block;width:0;height:1px";
      markerNode.replaceWith(spacer);
      spacers.push({ spacer, stops: match[1] ? match[1].split(",").map((value) => (Number(value) * 96) / 72) : [] });
      match = pattern.exec(node.nodeValue);
    }
  }
  const defaultStep = (36 * 96) / 72;
  for (const { spacer, stops } of spacers) {
    const section = spacer.closest("section.docx");
    if (!section) continue;
    const origin = section.getBoundingClientRect().left + (parseFloat(getComputedStyle(section).paddingLeft) || 0);
    const current = spacer.getBoundingClientRect().left - origin;
    const next = stops.find((position) => position > current + 0.5) ?? (Math.floor(current / defaultStep) + 1) * defaultStep;
    spacer.style.width = `${Math.max(0, next - current)}px`;
  }
}

function placeFloatingObjects(doc, floats) {
  const markerPattern = new RegExp(`${FLOAT_MARKER}(\\d+)${FLOAT_MARKER}`, "g");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const markers = [];
  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue.includes(FLOAT_MARKER)) markers.push(walker.currentNode);
  }
  for (const node of markers) {
    const ids = [...node.nodeValue.matchAll(markerPattern)].map((match) => Number(match[1]));
    const section = node.parentElement?.closest("section.docx");
    const paragraph = node.parentElement?.closest("p") ?? node.parentElement;
    node.nodeValue = node.nodeValue.replace(markerPattern, "");
    if (!section) continue;

    const sectionRect = section.getBoundingClientRect();
    const style = getComputedStyle(section);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const contentWidth = sectionRect.width - padLeft - (parseFloat(style.paddingRight) || 0);
    const paragraphTop = paragraph.getBoundingClientRect().top - sectionRect.top;

    for (const item of ids.map((id) => floats[id]).filter(Boolean)) {
      const pageFrame = item.h.from === "page" ? { start: 0, size: sectionRect.width } : { start: padLeft, size: contentWidth };
      const alignX = { left: 0, center: (pageFrame.size - item.width) / 2, right: pageFrame.size - item.width };
      const left = pageFrame.start + (item.h.align ? alignX[item.h.align] ?? 0 : item.h.offset);
      const verticalBase = { page: 0, margin: padTop, topMargin: 0 }[item.v.from] ?? paragraphTop;
      const top = verticalBase + (item.v.align === "center" ? (sectionRect.height - item.height) / 2 : item.v.offset);

      const element = doc.createElement("div");
      element.className = `docx-float ${item.behind ? "behind" : "front"}`;
      element.style.cssText = `left:${left}px;top:${top}px;width:${item.width}px;height:${item.height}px`;
      if (item.image) element.innerHTML = `<img src="${item.image}" alt="" style="width:100%;height:100%;display:block">`;
      else element.innerHTML = item.html;
      section.append(element);
    }
  }
}

async function docxToPdf(file, onProgress) {
  onProgress("Reading document…");
  let prepared;
  try {
    prepared = await extractFloatingObjects(await file.arrayBuffer());
  } catch {
    throw new Error("Could not read the DOCX file. It may be damaged or password-protected.");
  }

  const frame = await loadFrame(createDocumentHtml("", DOCX_CSS), 3000);
  try {
    const doc = frame.contentDocument;
    try {
      await docx.renderAsync(prepared.data, doc.body, doc.head, {
        className: "docx",
        inWrapper: false,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: false,
        renderFooters: false,
        useBase64URL: true,
      });
    } catch {
      throw new Error("Could not read the DOCX file. It may be damaged or password-protected.");
    }
    // docx-preview가 추가한 스타일보다 우선하도록 마지막에 다시 넣는다.
    const override = doc.createElement("style");
    override.textContent = DOCX_CSS;
    doc.head.append(override);
    placeTabStops(doc);
    placeFloatingObjects(doc, prepared.floats);
    // docx-preview는 그림을 "data:application/octet-stream"으로 넣는데, html2canvas는 data:image/… 가 아니면 그림을 건너뛴다.
    // 파일 앞부분(매직 넘버)으로 실제 형식을 알아내 고쳐 준다.
    for (const image of doc.images) {
      const match = /^data:application\/octet-stream;base64,(.*)$/s.exec(image.getAttribute("src") ?? "");
      if (!match) continue;
      const head = match[1].slice(0, 8);
      const mime = head.startsWith("/9j/") ? "image/jpeg"
        : head.startsWith("R0lGOD") ? "image/gif"
        : head.startsWith("Qk") ? "image/bmp"
        : head.startsWith("UklGR") ? "image/webp"
        : head.startsWith("PHN2Zy") || head.startsWith("PD94bW") ? "image/svg+xml"
        : "image/png";
      image.setAttribute("src", `data:${mime};base64,${match[1]}`);
    }
    await waitForResources(doc);

    // 페이지(section)마다 그 문서의 실제 크기로 찍는다. 내용이 한 페이지보다 길면 같은 크기의 여러 페이지로 나눈다.
    const sections = [...doc.querySelectorAll("section.docx")];
    if (sections.length === 0) throw new Error("The DOCX file has no pages to show.");
    frame.style.width = `${Math.ceil(Math.max(...sections.map((section) => section.getBoundingClientRect().right)))}px`;
    frame.style.height = `${Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)}px`;
    const ranges = collectUnbreakableRanges(doc);
    const floatRanges = [...doc.querySelectorAll(".docx-float")].map((node) => {
      const rect = node.getBoundingClientRect();
      return [rect.top, rect.bottom];
    });
    const hasContent = (top, bottom) => [...ranges, ...floatRanges].some(([start, end]) => start < bottom && end > top);
    const pages = [];
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const pageHeight = cssLengthToPx(section.style.minHeight) ?? (rect.width * 297) / 210;
      const breaks = findPageBreaks(doc, rect.bottom, pageHeight, { start: rect.top, ranges });
      for (let index = 0; index < breaks.length - 1; index += 1) {
        // 빈 문단 때문에 생긴, 내용 없는 이어지는 페이지는 넣지 않는다(각 section의 첫 페이지는 항상 넣는다).
        if (index > 0 && !hasContent(breaks[index], breaks[index + 1])) continue;
        pages.push({
          x: Math.round(rect.left),
          y: breaks[index],
          width: Math.round(rect.width),
          height: breaks[index + 1] - breaks[index],
          pageWidthMm: rect.width / CSS_PX_PER_MM,
          pageHeightMm: pageHeight / CSS_PX_PER_MM,
          marginMm: 0,
        });
      }
    }
    return await capturePages(doc, pages, onProgress);
  } finally {
    frame.remove();
  }
}

// ---------------------------------------------------------------------------
// 스프레드시트: XLSX·XLS·ODS (SheetJS)
// ---------------------------------------------------------------------------
const SHEET_CSS = `
  body { font-size: 9.5pt; }
  section + section { margin-top: 26px; }
  h2 { margin: 0 0 8px; font-size: 13pt; }
  table { font-size: 9.5pt; }
  td { border: 1px solid #c4cbc6; padding: 3px 7px; white-space: nowrap; }
  td[data-t="n"] { text-align: right; }
  tr:first-child td { background: #eef1ea; font-weight: 700; }
`;

async function spreadsheetToPdf(file, onProgress) {
  let workbook;
  try {
    workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true });
  } catch {
    throw new Error("Could not read the spreadsheet. It may be damaged or password-protected.");
  }
  const sections = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet?.["!ref"]) return "";
    const table = XLSX.utils.sheet_to_html(sheet, { header: "", footer: "" });
    return `<section><h2>${escapeHtml(name)}</h2>${table}</section>`;
  }).filter(Boolean);
  if (sections.length === 0) throw new Error("The workbook has no sheets with content.");
  return renderHtmlToPdf(createDocumentHtml(sections.join(""), SHEET_CSS), {
    widthPx: a4WidthPx(10),
    marginMm: 10,
    allowLandscape: true,
    onProgress,
  });
}

// ---------------------------------------------------------------------------
// OpenDocument 공통: 스타일 해석
// ---------------------------------------------------------------------------
function lengthToPx(value) {
  const match = /^(-?[\d.]+)\s*(in|cm|mm|pt|pc|px)?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const number = Number(match[1]);
  const factor = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, px: 1 }[match[2] ?? "px"];
  return number * factor;
}

function readOdfStyles(docs) {
  const styles = new Map();
  for (const doc of docs) {
    for (const style of descendants(doc, "style")) {
      const name = attr(style, "style:name");
      if (!name || style.namespaceURI !== style.lookupNamespaceURI("style")) continue;
      const props = {};
      for (const child of style.children) {
        if (!child.localName.endsWith("-properties")) continue;
        for (const attribute of child.attributes) props[attribute.name] = attribute.value;
      }
      styles.set(name, { parent: attr(style, "style:parent-style-name"), props });
    }
  }
  return styles;
}

function odfStyleProps(styles, name) {
  const chain = [];
  for (let current = name, guard = 0; current && guard < 20; guard += 1) {
    const style = styles.get(current);
    if (!style) break;
    chain.unshift(style.props);
    current = style.parent;
  }
  return Object.assign({}, ...chain);
}

function odfTextCss(props, fontScale = 1) {
  const css = [];
  if (props["fo:font-weight"] === "bold" || Number(props["fo:font-weight"]) >= 600) css.push("font-weight:700");
  if (props["fo:font-style"] === "italic") css.push("font-style:italic");
  const underline = props["style:text-underline-style"];
  if (underline && underline !== "none") css.push("text-decoration:underline");
  const size = /^([\d.]+)pt$/.exec(props["fo:font-size"] ?? "");
  if (size) css.push(`font-size:${(Number(size[1]) * fontScale).toFixed(2)}pt`);
  if (props["fo:color"]) css.push(`color:${props["fo:color"]}`);
  if (props["fo:background-color"] && props["fo:background-color"] !== "transparent") css.push(`background:${props["fo:background-color"]}`);
  return css.join(";");
}

function odfParagraphCss(props, fontScale) {
  const align = { start: "left", end: "right", left: "left", right: "right", center: "center", justify: "justify" }[props["fo:text-align"]];
  return [align ? `text-align:${align}` : "", odfTextCss(props, fontScale)].filter(Boolean).join(";");
}

// ODF 본문 요소를 HTML로 바꾼다. ODT 본문과 ODP 텍스트 상자가 함께 쓴다.
async function odfToHtml(node, context) {
  let html = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      html += escapeHtml(child.nodeValue);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const styleName = attr(child, "text:style-name") ?? attr(child, "table:style-name");
    const props = styleName ? odfStyleProps(context.styles, styleName) : {};

    switch (child.localName) {
      case "p":
      case "h": {
        const tag = child.localName === "h" ? `h${Math.min(6, Number(attr(child, "text:outline-level")) || 1)}` : "p";
        const inner = await odfToHtml(child, context);
        const bullet = context.bullet && context.inListItem ? "• " : "";
        html += `<${tag} style="${odfParagraphCss(props, context.fontScale)}">${bullet}${inner || "<br>"}</${tag}>`;
        break;
      }
      case "span":
      case "a":
        html += `<span style="${odfTextCss(props, context.fontScale)}">${await odfToHtml(child, context)}</span>`;
        break;
      case "s":
        html += "&nbsp;".repeat(Number(attr(child, "text:c")) || 1);
        break;
      case "tab":
        html += "&emsp;&emsp;";
        break;
      case "line-break":
        html += "<br>";
        break;
      case "list":
        html += context.bullet
          ? await odfToHtml(child, context)
          : `<ul>${await odfToHtml(child, context)}</ul>`;
        break;
      case "list-item":
      case "list-header":
        html += context.bullet
          ? await odfToHtml(child, { ...context, inListItem: true })
          : `<li>${await odfToHtml(child, context)}</li>`;
        break;
      case "table":
        html += `<table>${await odfToHtml(child, context)}</table>`;
        break;
      case "table-row":
        html += `<tr>${await odfToHtml(child, context)}</tr>`;
        break;
      case "table-cell": {
        const colspan = Number(attr(child, "table:number-columns-spanned")) || 1;
        const rowspan = Number(attr(child, "table:number-rows-spanned")) || 1;
        html += `<td colspan="${colspan}" rowspan="${rowspan}">${await odfToHtml(child, context)}</td>`;
        break;
      }
      case "frame": {
        const image = kid(child, "image");
        const textBox = kid(child, "text-box");
        if (image) {
          const source = await zipImage(context.zip, attr(image, "xlink:href"));
          const width = lengthToPx(attr(child, "svg:width"));
          const height = lengthToPx(attr(child, "svg:height"));
          if (source) {
            html += `<img src="${source}" alt="" style="${width ? `width:${width}px;` : ""}${height ? `height:${height}px;` : ""}object-fit:contain">`;
          }
        } else if (textBox) {
          html += await odfToHtml(textBox, context);
        }
        break;
      }
      // 각주·주석·변경 추적 기록·목차 원본 등은 본문에 넣지 않는다.
      case "note":
      case "annotation":
      case "tracked-changes":
      case "soft-page-break":
      case "covered-table-cell":
      case "table-columns":
      case "table-column":
      case "sequence-decls":
      case "variable-decls":
      case "user-field-decls":
      case "bookmark":
      case "bookmark-start":
      case "bookmark-end":
        break;
      default:
        html += await odfToHtml(child, context);
    }
  }
  return html;
}

async function openOdf(file, label) {
  const zip = await openZip(file, label);
  const content = await zipXml(zip, "content.xml");
  if (!content) throw new Error(`Could not find the ${label} content. The file may be password-protected.`);
  const stylesDoc = await zipXml(zip, "styles.xml");
  return { zip, content, stylesDoc, styles: readOdfStyles([stylesDoc, content].filter(Boolean)) };
}

async function odtToPdf(file, onProgress) {
  const { zip, content, styles } = await openOdf(file, "ODT");
  const text = kid(kid(content.documentElement, "body"), "text");
  if (!text) throw new Error("Could not find the ODT document body.");
  onProgress("Reading document…");
  const html = await odfToHtml(text, { zip, styles, fontScale: 1 });
  return renderDocument(html, onProgress);
}

// ---------------------------------------------------------------------------
// 슬라이드 공통 렌더링 (PPTX·ODP·PPT)
// slide = { background, html } — html은 SLIDE_WIDTH_PX 기준 절대 위치 요소들
// ---------------------------------------------------------------------------
const SLIDE_CSS = `
  body { font-family: ${DOCUMENT_FONT}; }
  .slide { position: relative; width: ${SLIDE_WIDTH_PX}px; overflow: hidden; background: #fff; }
  .shape { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; }
  .shape p { margin: 0; line-height: 1.18; white-space: pre-wrap; overflow-wrap: anywhere; }
  .shape img, .picture { position: absolute; }
  .shape table { width: 100%; height: 100%; border-collapse: collapse; }
  .shape td { border: 1px solid #7d8a84; padding: 3px 6px; vertical-align: top; }
`;

function renderSlides(slides, slideHeightPx, pageWidthMm, pageHeightMm, onProgress) {
  if (slides.length === 0) throw new Error("No slides found.");
  const body = slides
    .map((slide) => `<section class="slide" style="height:${slideHeightPx}px;background:${slide.background ?? "#fff"}">${slide.html}</section>`)
    .join("");
  return renderHtmlToPdf(createDocumentHtml(body, SLIDE_CSS), {
    widthPx: SLIDE_WIDTH_PX,
    marginMm: 0,
    pageWidthMm,
    pageHeightMm,
    slideHeightPx,
    onProgress,
  });
}

function boxStyle({ x, y, width, height, rotation = 0 }) {
  return `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${width.toFixed(1)}px;height:${height.toFixed(1)}px;`
    + (rotation ? `transform:rotate(${rotation}deg);` : "");
}

// ---------------------------------------------------------------------------
// PPTX
// ---------------------------------------------------------------------------
const EMU_PER_INCH = 914400;
const SCHEME_ALIASES = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };

function themeColors(themeDoc) {
  const colors = {};
  const scheme = descendants(themeDoc, "clrScheme")[0];
  for (const entry of scheme?.children ?? []) {
    const srgb = kid(entry, "srgbClr");
    const sys = kid(entry, "sysClr");
    colors[entry.localName] = srgb ? `#${attr(srgb, "val")}` : sys ? `#${attr(sys, "lastClr") ?? "000000"}` : null;
  }
  return colors;
}

function drawingColor(node, colors) {
  if (!node) return null;
  const srgb = kid(node, "srgbClr");
  if (srgb) return `#${attr(srgb, "val")}`;
  const scheme = kid(node, "schemeClr");
  if (scheme) {
    const name = attr(scheme, "val");
    return colors[SCHEME_ALIASES[name] ?? name] ?? null;
  }
  const sys = kid(node, "sysClr");
  if (sys) return `#${attr(sys, "lastClr") ?? "000000"}`;
  return null;
}

function placeholderInfo(shape) {
  const nvPr = kid(kid(shape, "nvSpPr") ?? kid(shape, "nvPicPr") ?? kid(shape, "nvGraphicFramePr"), "nvPr");
  const ph = kid(nvPr, "ph");
  if (!ph) return null;
  return { type: attr(ph, "type") ?? "body", idx: attr(ph, "idx") };
}

function placeholderCategory(type) {
  if (type === "title" || type === "ctrTitle") return "title";
  if (["body", "subTitle", "obj", "tbl", "chart", "dgm", "media", "clipArt", "pic"].includes(type)) return "body";
  return "other";
}

function findPlaceholder(part, info) {
  if (!part || !info) return null;
  const shapes = descendants(part.doc, "sp").filter((shape) => placeholderInfo(shape));
  const normalize = (type) => ({ ctrTitle: "title", subTitle: "body", obj: "body" })[type] ?? type;
  return (
    (info.idx != null ? shapes.find((shape) => placeholderInfo(shape).idx === info.idx) : null)
    ?? shapes.find((shape) => placeholderInfo(shape).type === info.type)
    ?? shapes.find((shape) => normalize(placeholderInfo(shape).type) === normalize(info.type))
    ?? null
  );
}

function readXfrm(xfrm) {
  const off = kid(xfrm, "off");
  const ext = kid(xfrm, "ext");
  if (!off || !ext) return null;
  return {
    x: Number(attr(off, "x")),
    y: Number(attr(off, "y")),
    width: Number(attr(ext, "cx")),
    height: Number(attr(ext, "cy")),
    rotation: Number(attr(xfrm, "rot") ?? 0) / 60000,
  };
}

function applyTransform(box, transform, scale) {
  return {
    x: (box.x * transform.a + transform.b) * scale,
    y: (box.y * transform.c + transform.d) * scale,
    width: box.width * transform.a * scale,
    height: box.height * transform.c * scale,
    rotation: box.rotation,
  };
}

// 슬라이드 → 레이아웃 → 마스터 순으로 같은 자리표시자를 찾아 값이 있는 첫 항목을 쓴다.
function inherited(chain, read) {
  for (const node of chain) {
    const value = node ? read(node) : null;
    if (value != null) return value;
  }
  return null;
}

function levelStyles(context, info, txBody, lvl) {
  const levelName = `lvl${lvl + 1}pPr`;
  const lists = [
    kid(txBody, "lstStyle"),
    ...context.chain.map((shape) => kid(kid(shape, "txBody"), "lstStyle")),
  ];
  const txStyles = kid(context.master?.doc.documentElement, "txStyles");
  const category = info ? placeholderCategory(info.type) : "other";
  lists.push(kid(txStyles, category === "title" ? "titleStyle" : category === "body" ? "bodyStyle" : "otherStyle"));
  return lists.map((list) => kid(list, levelName));
}

function pptxParagraphs(txBody, context, info, defaults) {
  const autofit = kid(kid(txBody, "bodyPr"), "normAutofit");
  const fontScale = Number(attr(autofit, "fontScale") ?? 100000) / 100000;
  let html = "";
  for (const paragraph of kids(txBody, "p")) {
    const pPr = kid(paragraph, "pPr");
    const lvl = Number(attr(pPr, "lvl") ?? 0);
    const levels = [pPr, ...levelStyles(context, info, txBody, lvl)];
    const defRPrs = levels.map((level) => (level === pPr ? null : kid(level, "defRPr")));

    const align = inherited(levels, (level) => attr(level, "algn"));
    const baseSize = Number(inherited(defRPrs, (rPr) => attr(rPr, "sz")) ?? defaults.size * 100) / 100;
    // 마스터 공통 글자색(마지막 항목)보다 도형 자체 스타일(fontRef) 색을 우선한다.
    const readColor = (rPr) => drawingColor(kid(rPr, "solidFill"), context.colors);
    const baseColor = inherited(defRPrs.slice(0, -1), readColor) ?? defaults.shapeColor ?? inherited(defRPrs.slice(-1), readColor) ?? defaults.color;
    const baseBold = inherited(defRPrs, (rPr) => attr(rPr, "b")) === "1";
    const bulletNode = inherited(levels, (level) => kid(level, "buNone") ?? kid(level, "buChar") ?? kid(level, "buAutoNum"));
    const bullet = bulletNode?.localName === "buChar" ? attr(bulletNode, "char") : bulletNode?.localName === "buAutoNum" ? "•" : "";

    let runs = "";
    let text = "";
    for (const run of paragraph.children) {
      if (run.localName === "br") {
        runs += "<br>";
        continue;
      }
      if (run.localName !== "r" && run.localName !== "fld") continue;
      const rPr = kid(run, "rPr");
      const value = kid(run, "t")?.textContent ?? "";
      text += value;
      const size = Number(attr(rPr, "sz") ?? baseSize * 100) / 100;
      const css = [
        `font-size:${(size * fontScale * context.scalePt).toFixed(2)}px`,
        `color:${drawingColor(kid(rPr, "solidFill"), context.colors) ?? baseColor}`,
        (attr(rPr, "b") ?? (baseBold ? "1" : "0")) === "1" ? "font-weight:700" : "",
        attr(rPr, "i") === "1" ? "font-style:italic" : "",
        attr(rPr, "u") && attr(rPr, "u") !== "none" ? "text-decoration:underline" : "",
      ].filter(Boolean).join(";");
      runs += `<span style="${css}">${escapeHtml(value)}</span>`;
    }
    const endSize = Number(attr(kid(paragraph, "endParaRPr"), "sz") ?? baseSize * 100) / 100;
    const alignCss = { ctr: "center", r: "right", just: "justify", dist: "justify" }[align] ?? "left";
    const indent = lvl * 0.9;
    const bulletHtml = bullet && text.trim() ? `<span style="color:${baseColor}">${escapeHtml(bullet)}&nbsp;</span>` : "";
    html += `<p style="text-align:${alignCss};font-size:${(endSize * fontScale * context.scalePt).toFixed(2)}px;padding-left:${indent}em">${bulletHtml}${runs || "&nbsp;"}</p>`;
  }
  return html;
}

async function pptxShape(shape, context, transform) {
  const info = placeholderInfo(shape);
  if (info && context.skipPlaceholders) return "";
  const chain = info ? [findPlaceholder(context.layout, info), findPlaceholder(context.master, info)] : [];
  const shapeContext = { ...context, chain };
  const spPr = kid(shape, "spPr");
  const xfrm = readXfrm(kid(spPr, "xfrm")) ?? inherited(chain, (node) => readXfrm(kid(kid(node, "spPr"), "xfrm")));
  if (!xfrm) return "";
  const box = applyTransform(xfrm, transform, context.scale);
  const style = kid(shape, "style");

  const css = [boxStyle(box)];
  if (!kid(spPr, "noFill")) {
    const fill = drawingColor(kid(spPr, "solidFill"), context.colors)
      ?? (Number(attr(kid(style, "fillRef"), "idx") ?? 0) > 0 ? drawingColor(kid(style, "fillRef"), context.colors) : null);
    if (fill) css.push(`background:${fill}`);
  }
  const line = kid(spPr, "ln");
  if (!kid(line, "noFill")) {
    const stroke = drawingColor(kid(line, "solidFill"), context.colors)
      ?? (Number(attr(kid(style, "lnRef"), "idx") ?? 0) > 0 ? drawingColor(kid(style, "lnRef"), context.colors) : null);
    if (stroke) css.push(`border:${Math.max(1, (Number(attr(line, "w") ?? 12700) * context.scale)).toFixed(1)}px solid ${stroke}`);
  }
  const geometry = attr(kid(spPr, "prstGeom"), "prst");
  if (geometry === "ellipse") css.push("border-radius:50%");
  if (geometry === "roundRect") css.push("border-radius:10%");

  const txBody = kid(shape, "txBody");
  let inner = "";
  if (txBody && descendants(txBody, "t").some((node) => node.textContent)) {
    const bodyPrs = [kid(txBody, "bodyPr"), ...chain.map((node) => kid(kid(node, "txBody"), "bodyPr"))];
    const anchor = inherited(bodyPrs, (bodyPr) => attr(bodyPr, "anchor"));
    css.push(`justify-content:${{ ctr: "center", b: "flex-end" }[anchor] ?? "flex-start"}`);
    const inset = (name, fallback) => (Number(inherited(bodyPrs, (bodyPr) => attr(bodyPr, name)) ?? fallback) * context.scale).toFixed(1);
    css.push(`padding:${inset("tIns", 45720)}px ${inset("rIns", 91440)}px ${inset("bIns", 45720)}px ${inset("lIns", 91440)}px`);
    const category = info ? placeholderCategory(info.type) : "other";
    inner = pptxParagraphs(txBody, shapeContext, info, {
      size: category === "title" ? 44 : category === "body" ? 24 : 18,
      shapeColor: drawingColor(kid(style, "fontRef"), context.colors),
      color: context.colors.dk1 ?? "#000",
    });
  }
  return `<div class="shape" style="${css.join(";")}">${inner}</div>`;
}

async function pptxPicture(picture, context, transform) {
  const info = placeholderInfo(picture);
  if (info && context.skipPlaceholders) return "";
  const chain = info ? [findPlaceholder(context.layout, info), findPlaceholder(context.master, info)] : [];
  const xfrm = readXfrm(kid(kid(picture, "spPr"), "xfrm")) ?? inherited(chain, (node) => readXfrm(kid(kid(node, "spPr"), "xfrm")));
  const embed = attr(descendants(picture, "blip")[0], "r:embed");
  const source = embed ? await zipImage(context.zip, context.rels[embed]?.target) : null;
  if (!xfrm || !source) return "";
  return `<img class="picture" src="${source}" alt="" style="${boxStyle(applyTransform(xfrm, transform, context.scale))}">`;
}

function pptxTable(frame, context, transform) {
  const xfrm = readXfrm(kid(frame, "xfrm"));
  const table = descendants(frame, "tbl")[0];
  if (!xfrm || !table) return "";
  let rows = "";
  for (const row of kids(table, "tr")) {
    let cells = "";
    for (const cell of kids(row, "tc")) {
      if (attr(cell, "hMerge") === "1" || attr(cell, "vMerge") === "1") continue;
      const fill = drawingColor(kid(kid(cell, "tcPr"), "solidFill"), context.colors);
      const text = pptxParagraphs(kid(cell, "txBody"), { ...context, chain: [] }, null, { size: 18, color: context.colors.dk1 ?? "#000" });
      cells += `<td colspan="${attr(cell, "gridSpan") ?? 1}" rowspan="${attr(cell, "rowSpan") ?? 1}"${fill ? ` style="background:${fill}"` : ""}>${text}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  }
  return `<div class="shape" style="${boxStyle(applyTransform(xfrm, transform, context.scale))}"><table>${rows}</table></div>`;
}

async function pptxTree(tree, context, transform = { a: 1, b: 0, c: 1, d: 0 }) {
  let html = "";
  for (const node of tree?.children ?? []) {
    switch (node.localName) {
      case "sp":
      case "cxnSp":
        html += await pptxShape(node, context, transform);
        break;
      case "pic":
        html += await pptxPicture(node, context, transform);
        break;
      case "graphicFrame":
        html += pptxTable(node, context, transform);
        break;
      case "grpSp": {
        const xfrm = kid(kid(node, "grpSpPr"), "xfrm");
        const off = kid(xfrm, "off");
        const ext = kid(xfrm, "ext");
        const childOff = kid(xfrm, "chOff");
        const childExt = kid(xfrm, "chExt");
        let inner = transform;
        if (off && ext && childOff && childExt) {
          const scaleX = Number(attr(childExt, "cx")) ? Number(attr(ext, "cx")) / Number(attr(childExt, "cx")) : 1;
          const scaleY = Number(attr(childExt, "cy")) ? Number(attr(ext, "cy")) / Number(attr(childExt, "cy")) : 1;
          inner = {
            a: transform.a * scaleX,
            b: transform.a * (Number(attr(off, "x")) - Number(attr(childOff, "x")) * scaleX) + transform.b,
            c: transform.c * scaleY,
            d: transform.c * (Number(attr(off, "y")) - Number(attr(childOff, "y")) * scaleY) + transform.d,
          };
        }
        html += await pptxTree(node, context, inner);
        break;
      }
      case "AlternateContent":
        html += await pptxTree(kid(node, "Fallback"), context, transform);
        break;
      default:
        break;
    }
  }
  return html;
}

function pptxBackground(parts, colors) {
  for (const part of parts) {
    const bg = kid(kid(part?.doc.documentElement, "cSld"), "bg");
    const fill = drawingColor(kid(kid(bg, "bgPr"), "solidFill"), colors) ?? drawingColor(kid(bg, "bgRef"), colors);
    if (fill) return fill;
  }
  return "#fff";
}

async function pptxToPdf(file, onProgress) {
  const zip = await openZip(file, "PPTX");
  const presentationPath = "ppt/presentation.xml";
  const presentation = await zipXml(zip, presentationPath);
  if (!presentation) throw new Error("Could not read the PPTX structure. The file may be password-protected.");
  const presentationRels = await zipRels(zip, presentationPath);
  const size = descendants(presentation, "sldSz")[0];
  const widthEmu = Number(attr(size, "cx")) || 12192000;
  const heightEmu = Number(attr(size, "cy")) || 6858000;
  const scale = SLIDE_WIDTH_PX / widthEmu;
  const slideHeightPx = Math.round(heightEmu * scale);

  const parts = new Map();
  const loadPart = async (path) => {
    if (!path) return null;
    if (!parts.has(path)) {
      const doc = await zipXml(zip, path);
      parts.set(path, doc ? { path, doc, rels: await zipRels(zip, path) } : null);
    }
    return parts.get(path);
  };

  const slidePaths = descendants(presentation, "sldId")
    .map((slideId) => presentationRels[attr(slideId, "r:id")]?.target)
    .filter(Boolean);
  const slides = [];
  for (const [index, path] of slidePaths.entries()) {
    onProgress(`Reading slide ${index + 1}/${slidePaths.length}…`);
    const slide = await loadPart(path);
    if (!slide) continue;
    if (attr(slide.doc.documentElement, "show") === "0") continue;
    const layout = await loadPart(relTargetByType(slide.rels, "slideLayout"));
    const master = await loadPart(layout && relTargetByType(layout.rels, "slideMaster"));
    const theme = await loadPart(master && relTargetByType(master.rels, "theme"));
    const colors = theme ? themeColors(theme.doc) : {};
    const base = { zip, scale, scalePt: (EMU_PER_INCH / 72) * scale, colors, layout, master };
    const treeOf = (part) => kid(kid(part?.doc.documentElement, "cSld"), "spTree");

    let html = "";
    const showMaster = attr(slide.doc.documentElement, "showMasterSp") !== "0";
    if (master && showMaster && attr(layout?.doc.documentElement, "showMasterSp") !== "0") {
      html += await pptxTree(treeOf(master), { ...base, rels: master.rels, skipPlaceholders: true });
    }
    if (layout && showMaster) html += await pptxTree(treeOf(layout), { ...base, rels: layout.rels, skipPlaceholders: true });
    html += await pptxTree(treeOf(slide), { ...base, rels: slide.rels, skipPlaceholders: false });
    slides.push({ background: pptxBackground([slide, layout, master], colors), html });
  }
  return renderSlides(slides, slideHeightPx, widthEmu / 36000, heightEmu / 36000, onProgress);
}

// ---------------------------------------------------------------------------
// ODP
// ---------------------------------------------------------------------------
async function odpShape(node, context) {
  if (node.localName === "g") {
    let html = "";
    for (const child of node.children) html += await odpShape(child, context);
    return html;
  }
  if (!["frame", "custom-shape", "rect", "ellipse", "circle"].includes(node.localName)) return "";

  const x = lengthToPx(attr(node, "svg:x"));
  const y = lengthToPx(attr(node, "svg:y"));
  const width = lengthToPx(attr(node, "svg:width"));
  const height = lengthToPx(attr(node, "svg:height"));
  if ([x, y, width, height].some((value) => value == null)) return "";
  const box = { x: x * context.scale, y: y * context.scale, width: width * context.scale, height: height * context.scale };

  const image = kid(node, "image");
  if (image) {
    const source = await zipImage(context.zip, attr(image, "xlink:href"));
    return source ? `<img class="picture" src="${source}" alt="" style="${boxStyle(box)}">` : "";
  }

  const shapeStyle = attr(node, "presentation:style-name") ?? attr(node, "draw:style-name");
  const props = shapeStyle ? odfStyleProps(context.styles, shapeStyle) : {};
  const css = [boxStyle(box)];
  if (props["draw:fill"] === "solid" && props["draw:fill-color"]) css.push(`background:${props["draw:fill-color"]}`);
  if (props["draw:stroke"] === "solid") css.push(`border:1px solid ${props["svg:stroke-color"] ?? "#000"}`);
  const geometry = attr(kid(node, "enhanced-geometry"), "draw:type");
  if (node.localName === "ellipse" || node.localName === "circle" || geometry === "ellipse") css.push("border-radius:50%");
  const verticalAlign = props["draw:textarea-vertical-align"];
  css.push(`justify-content:${{ middle: "center", bottom: "flex-end" }[verticalAlign] ?? "flex-start"}`);
  css.push(`padding:${(0.1 * 96 * context.scale).toFixed(1)}px`);

  const presentationClass = attr(node, "presentation:class");
  const fallbackSize = presentationClass === "title" ? 40 : 20;
  const baseSize = /^([\d.]+)pt$/.exec(props["fo:font-size"] ?? "")?.[1] ?? fallbackSize;
  css.push(`font-size:${(Number(baseSize) * context.fontScale).toFixed(2)}pt`);
  css.push(`color:${props["fo:color"] ?? "#1d1d1d"}`);
  if (props["fo:font-weight"] === "bold") css.push("font-weight:700");
  if (presentationClass === "title" || presentationClass === "subtitle") css.push("text-align:center");

  const textSource = kid(node, "text-box") ?? node;
  const text = await odfToHtml(textSource, { ...context, bullet: presentationClass === "outline" });
  return `<div class="shape" style="${css.join(";")}">${text}</div>`;
}

async function odpToPdf(file, onProgress) {
  const { zip, content, stylesDoc, styles } = await openOdf(file, "ODP");
  const presentation = kid(kid(content.documentElement, "body"), "presentation");
  if (!presentation) throw new Error("Could not find the ODP presentation.");

  const layout = descendants(stylesDoc, "page-layout-properties").find((node) => attr(node, "fo:page-width"));
  const pageWidth = lengthToPx(attr(layout, "fo:page-width")) ?? 1280;
  const pageHeight = lengthToPx(attr(layout, "fo:page-height")) ?? 720;
  const scale = SLIDE_WIDTH_PX / pageWidth;
  const context = { zip, styles, scale, fontScale: scale };

  const pages = kids(presentation, "page");
  const slides = [];
  for (const [index, page] of pages.entries()) {
    onProgress(`Reading slide ${index + 1}/${pages.length}…`);
    const pageProps = odfStyleProps(styles, attr(page, "draw:style-name"));
    const background = pageProps["draw:fill"] === "solid" ? pageProps["draw:fill-color"] : null;
    let html = "";
    for (const child of page.children) html += await odpShape(child, context);
    slides.push({ background, html });
  }
  return renderSlides(slides, Math.round(pageHeight * scale), (pageWidth / 96) * 25.4, (pageHeight / 96) * 25.4, onProgress);
}

// ---------------------------------------------------------------------------
// RTF
// ---------------------------------------------------------------------------
const RTF_CODEPAGES = { 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5", 1250: "windows-1250", 1251: "windows-1251", 1252: "windows-1252", 1253: "windows-1253", 1254: "windows-1254", 1255: "windows-1255", 1256: "windows-1256", 1257: "windows-1257", 1258: "windows-1258" };
const RTF_SKIP_DESTINATIONS = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "listtable", "listoverridetable", "rsidtbl", "generator",
  "xmlnstbl", "themedata", "colorschememapping", "datastore", "latentstyles", "pgdsctbl", "header",
  "headerl", "headerr", "headerf", "footer", "footerl", "footerr", "footerf", "fldinst", "nonshppict",
  "object", "footnote", "annotation", "bkmkstart", "bkmkend", "revtbl", "filetbl", "mmathPr", "wgrffmtfilter",
  "pnseclvl", "listtext", "pntext", "pntxta", "pntxtb", "sp", "sn", "sv", "shpinst",
]);
const RTF_SYMBOLS = { emdash: "—", endash: "–", bullet: "•", lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”", tab: "\t", emspace: " ", enspace: " " };

function parseRtf(bytes) {
  let decoder = new TextDecoder("windows-1252");
  const blocks = [];
  let paragraph = { align: "left", runs: [] };
  let row = null;
  let cell = [];
  let pendingBytes = [];
  let state = { skip: false, bold: false, italic: false, underline: false, size: 0, uc: 1, inTable: false, pict: null };
  const stack = [];
  let skipChars = 0;

  const flushBytes = () => {
    if (pendingBytes.length === 0) return;
    pushText(decoder.decode(new Uint8Array(pendingBytes)), true);
    pendingBytes = [];
  };
  function pushText(text, decoded = false) {
    if (!decoded) flushBytes();
    if (state.skip || !text) return;
    if (state.pict) {
      state.pict.hex += text;
      return;
    }
    paragraph.runs.push({ text, bold: state.bold, italic: state.italic, underline: state.underline, size: state.size });
  }
  const endParagraph = () => {
    flushBytes();
    if (state.inTable) cell.push(paragraph);
    else blocks.push({ type: "p", paragraph });
    paragraph = { align: paragraph.align, runs: [] };
  };
  const endCell = () => {
    flushBytes();
    if (paragraph.runs.length) cell.push(paragraph);
    paragraph = { align: paragraph.align, runs: [] };
    row ??= [];
    row.push(cell);
    cell = [];
  };
  const endRow = () => {
    flushBytes();
    if (row) {
      const last = blocks.at(-1);
      if (last?.type === "table") last.rows.push(row);
      else blocks.push({ type: "table", rows: [row] });
    }
    row = null;
    cell = [];
  };

  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === 0x7b) { // {
      flushBytes();
      stack.push(state);
      state = { ...state, pict: state.pict };
      continue;
    }
    if (byte === 0x7d) { // }
      flushBytes();
      const closing = state;
      state = stack.pop() ?? state;
      if (closing.pict && closing.pict !== state.pict) {
        const { hex, type, width, height } = closing.pict;
        const clean = hex.replace(/[^0-9a-f]/gi, "");
        if (type && clean.length > 0) {
          let binary = "";
          for (let offset = 0; offset + 1 < clean.length; offset += 2) binary += String.fromCharCode(parseInt(clean.slice(offset, offset + 2), 16));
          const sizeCss = width && height ? `width:${(width / 15).toFixed(0)}px;height:${(height / 15).toFixed(0)}px` : "";
          paragraph.runs.push({ image: `data:${type};base64,${btoa(binary)}`, sizeCss });
        }
      }
      continue;
    }
    if (byte === 0x0d || byte === 0x0a) continue;
    if (byte !== 0x5c) { // 일반 문자
      if (skipChars > 0) {
        skipChars -= 1;
        continue;
      }
      if (byte >= 0x80) pendingBytes.push(byte);
      else pushText(String.fromCharCode(byte));
      continue;
    }

    // 제어 기호·제어어 (\)
    const next = bytes[index + 1];
    if (next === 0x27) { // \'hh
      const hex = String.fromCharCode(bytes[index + 2], bytes[index + 3]);
      index += 3;
      if (skipChars > 0) {
        skipChars -= 1;
        continue;
      }
      if (!state.skip) {
        if (state.pict) state.pict.hex += hex;
        else pendingBytes.push(parseInt(hex, 16));
      }
      continue;
    }
    if (next === 0x5c || next === 0x7b || next === 0x7d) {
      pushText(String.fromCharCode(next));
      index += 1;
      continue;
    }
    if (next === 0x2a) { // \* — 모르는 대상이면 그룹 전체를 건너뛴다
      index += 1;
      state.skip = true;
      continue;
    }
    if (next === 0x7e) { // \~
      pushText(" ");
      index += 1;
      continue;
    }
    if (!/[a-z]/i.test(String.fromCharCode(next))) {
      index += 1;
      if (next === 0x0d || next === 0x0a) endParagraph();
      continue;
    }

    let end = index + 1;
    while (end < bytes.length && /[a-z]/i.test(String.fromCharCode(bytes[end]))) end += 1;
    const word = String.fromCharCode(...bytes.subarray(index + 1, end));
    let numberEnd = end;
    if (bytes[numberEnd] === 0x2d) numberEnd += 1;
    while (numberEnd < bytes.length && bytes[numberEnd] >= 0x30 && bytes[numberEnd] <= 0x39) numberEnd += 1;
    const parameterText = String.fromCharCode(...bytes.subarray(end, numberEnd));
    const parameter = parameterText && parameterText !== "-" ? Number(parameterText) : null;
    index = numberEnd - 1;
    if (bytes[numberEnd] === 0x20) index += 1;

    if (word === "bin" && parameter > 0) {
      index += parameter;
      continue;
    }
    if (state.skip && word !== "pict") continue;
    if (RTF_SKIP_DESTINATIONS.has(word)) {
      flushBytes();
      state.skip = true;
      continue;
    }

    switch (word) {
      case "ansicpg":
        if (RTF_CODEPAGES[parameter]) decoder = new TextDecoder(RTF_CODEPAGES[parameter]);
        break;
      case "u":
        flushBytes();
        pushText(String.fromCharCode(parameter < 0 ? parameter + 65536 : parameter));
        skipChars = state.uc;
        break;
      case "uc":
        state.uc = parameter ?? 1;
        break;
      case "par":
      case "sect":
      case "page":
        endParagraph();
        break;
      case "line":
        pushText("\n");
        break;
      case "cell":
      case "nestcell":
        endCell();
        break;
      case "row":
      case "nestrow":
        endRow();
        break;
      case "intbl":
        state.inTable = true;
        break;
      case "pard":
        flushBytes();
        state.inTable = false;
        paragraph.align = "left";
        break;
      case "plain":
        flushBytes();
        Object.assign(state, { bold: false, italic: false, underline: false, size: 0 });
        break;
      case "b":
      case "i":
        flushBytes();
        state[word === "b" ? "bold" : "italic"] = parameter !== 0;
        break;
      case "ul":
        flushBytes();
        state.underline = parameter !== 0;
        break;
      case "ulnone":
        flushBytes();
        state.underline = false;
        break;
      case "fs":
        flushBytes();
        state.size = (parameter ?? 24) / 2;
        break;
      case "ql":
      case "qc":
      case "qr":
      case "qj":
        paragraph.align = { ql: "left", qc: "center", qr: "right", qj: "justify" }[word];
        break;
      case "pict":
        flushBytes();
        state.skip = false;
        state.pict = { hex: "", type: null, width: 0, height: 0 };
        break;
      case "pngblip":
      case "jpegblip":
        if (state.pict) state.pict.type = word === "pngblip" ? "image/png" : "image/jpeg";
        break;
      case "picwgoal":
        if (state.pict) state.pict.width = parameter;
        break;
      case "pichgoal":
        if (state.pict) state.pict.height = parameter;
        break;
      default:
        if (RTF_SYMBOLS[word]) pushText(RTF_SYMBOLS[word]);
    }
  }
  flushBytes();
  if (paragraph.runs.length) blocks.push({ type: "p", paragraph });
  return blocks;
}

function rtfParagraphHtml(paragraph) {
  const runs = paragraph.runs.map((run) => {
    if (run.image) return `<img src="${run.image}" alt="" style="${run.sizeCss}">`;
    const css = [
      run.bold ? "font-weight:700" : "",
      run.italic ? "font-style:italic" : "",
      run.underline ? "text-decoration:underline" : "",
      run.size ? `font-size:${run.size}pt` : "",
    ].filter(Boolean).join(";");
    const text = escapeHtml(run.text).replaceAll("\n", "<br>").replaceAll("\t", "&emsp;&emsp;");
    return css ? `<span style="${css}">${text}</span>` : text;
  }).join("");
  return `<p style="text-align:${paragraph.align};white-space:pre-wrap">${runs || "<br>"}</p>`;
}

async function rtfToPdf(file, onProgress) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder("latin1").decode(bytes.subarray(0, 5)).startsWith("{\\rtf")) throw new Error("This is not a valid RTF file.");
  const html = parseRtf(bytes).map((block) => {
    if (block.type === "p") return rtfParagraphHtml(block.paragraph);
    const rows = block.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell.map(rtfParagraphHtml).join("")}</td>`).join("")}</tr>`);
    return `<table>${rows.join("")}</table>`;
  }).join("");
  return renderDocument(html, onProgress);
}

// ---------------------------------------------------------------------------
// 옛 바이너리 형식: DOC (Word 97-2003), PPT (PowerPoint 97-2003)
// 서식·배치 정보는 너무 복잡해서 텍스트(와 표 구조)만 꺼낸다.
// ---------------------------------------------------------------------------
function openCompoundFile(data, label) {
  try {
    return XLSX.CFB.read(new Uint8Array(data), { type: "array" });
  } catch {
    throw new Error(`Could not open the ${label} file. It may be damaged.`);
  }
}

function compoundStream(container, name) {
  const entry = XLSX.CFB.find(container, name);
  if (!entry?.content) return null;
  return entry.content instanceof Uint8Array ? entry.content : Uint8Array.from(entry.content);
}

function docText(data) {
  const container = openCompoundFile(data, "DOC");
  const word = compoundStream(container, "WordDocument");
  if (!word) throw new Error("Could not find the Word document content.");
  const wordView = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (wordView.getUint16(0, true) !== 0xa5ec) throw new Error("Only Word 97 or later DOC files are supported.");
  const flags = wordView.getUint16(0x0a, true);
  if (flags & 0x0100) throw new Error("Password-protected DOC files are not supported.");
  const table = compoundStream(container, flags & 0x0200 ? "1Table" : "0Table");
  if (!table) throw new Error("Could not find the Word document table stream.");
  const tableView = new DataView(table.buffer, table.byteOffset, table.byteLength);

  const textLength = wordView.getInt32(0x4c, true);
  const clxOffset = wordView.getUint32(0x1a2, true);
  const clxLength = wordView.getUint32(0x1a6, true);
  let position = clxOffset;
  while (position < clxOffset + clxLength && table[position] === 0x01) position += 3 + tableView.getUint16(position + 1, true);
  if (table[position] !== 0x02) throw new Error("Could not read the Word document text layout.");
  const pieceTableLength = tableView.getUint32(position + 1, true);
  const pieceTable = position + 5;
  const pieceCount = (pieceTableLength - 4) / 12;

  const latin = new TextDecoder("windows-1252");
  const unicode = new TextDecoder("utf-16le");
  let text = "";
  for (let piece = 0; piece < pieceCount && text.length < textLength; piece += 1) {
    const start = tableView.getUint32(pieceTable + piece * 4, true);
    const end = tableView.getUint32(pieceTable + (piece + 1) * 4, true);
    const descriptor = pieceTable + (pieceCount + 1) * 4 + piece * 8;
    const fcValue = tableView.getUint32(descriptor + 2, true);
    const length = Math.min(end, textLength) - start;
    if (length <= 0) continue;
    if (fcValue & 0x40000000) {
      const offset = (fcValue & 0x3fffffff) / 2;
      text += latin.decode(word.subarray(offset, offset + length));
    } else {
      text += unicode.decode(word.subarray(fcValue, fcValue + length * 2));
    }
  }
  return text;
}

// Word 특수 문자: \r 문단, \x07 표 칸/행 끝, \x0b 줄바꿈, \x0c 쪽 나눔, \x13~\x15 필드
function docTextToHtml(text) {
  const blocks = [];
  let paragraph = "";
  let cell = [];
  let row = [];
  let previousWasCellEnd = false;
  const fields = [];

  const flushRow = () => {
    if (row.length === 0) return;
    const last = blocks.at(-1);
    if (last?.type === "table") last.rows.push(row);
    else blocks.push({ type: "table", rows: [row] });
    row = [];
  };

  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code === 0x13) {
      fields.push("instruction");
      continue;
    }
    if (code === 0x14) {
      if (fields.length) fields[fields.length - 1] = "result";
      continue;
    }
    if (code === 0x15) {
      fields.pop();
      continue;
    }
    if (fields.includes("instruction")) continue;

    if (code === 0x07) {
      if (previousWasCellEnd && paragraph === "" && cell.length === 0) {
        flushRow();
      } else {
        cell.push(paragraph);
        row.push(cell);
        cell = [];
        paragraph = "";
      }
      previousWasCellEnd = true;
      continue;
    }
    previousWasCellEnd = false;
    if (code === 0x0d || code === 0x0c) {
      if (row.length > 0 || cell.length > 0) {
        cell.push(paragraph);
      } else {
        flushRow();
        blocks.push({ type: "p", text: paragraph });
      }
      paragraph = "";
      continue;
    }
    if (code === 0x0b) paragraph += "\n";
    else if (code === 0x09) paragraph += "\t";
    else if (code === 0x1e) paragraph += "-";
    else if (code === 0xa0) paragraph += " ";
    else if (code >= 0x20) paragraph += character;
  }
  flushRow();
  if (paragraph) blocks.push({ type: "p", text: paragraph });

  const paragraphHtml = (value) => `<p style="white-space:pre-wrap">${escapeHtml(value) || "<br>"}</p>`;
  return blocks.map((block) =>
    block.type === "p"
      ? paragraphHtml(block.text)
      : `<table>${block.rows.map((cells) => `<tr>${cells.map((value) => `<td>${value.map(paragraphHtml).join("")}</td>`).join("")}</tr>`).join("")}</table>`,
  ).join("");
}

async function docToPdf(file, onProgress) {
  const text = docText(await file.arrayBuffer());
  if (!text.trim()) throw new Error("No text found in the DOC file.");
  return renderDocument(docTextToHtml(text), onProgress);
}

function pptSlides(data) {
  const container = openCompoundFile(data, "PPT");
  const stream = compoundStream(container, "PowerPoint Document");
  if (!stream) throw new Error("Could not find the PowerPoint document content.");
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const unicode = new TextDecoder("utf-16le");
  const latin = new TextDecoder("windows-1252");

  const outlineSlides = [];
  const drawingSlides = [];
  let size = { width: 5760, height: 4320 };

  // 레코드 머리글: recVer/recInstance(2) · recType(2) · recLen(4). recVer가 0xF면 하위 레코드를 담은 컨테이너다.
  const walk = (start, end, scope) => {
    let offset = start;
    let textType = null;
    while (offset + 8 <= end) {
      const versionInstance = view.getUint16(offset, true);
      const type = view.getUint16(offset + 2, true);
      const length = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (body + length > end) break;

      if ((versionInstance & 0x0f) === 0x0f) {
        if (type === 0x0ff0) walk(body, body + length, (versionInstance >> 4) === 0 ? "outline" : "skip");
        else if (type === 0x03ee) {
          drawingSlides.push([]);
          walk(body, body + length, "drawing");
        } else if (type === 0x03f0 || type === 0x03f8 || type === 0x0f03) {
          // 노트·마스터·원본 슬라이드는 건너뛴다.
        } else walk(body, body + length, scope);
      } else if (type === 0x03e9 && length >= 8) {
        size = { width: view.getInt32(body, true), height: view.getInt32(body + 4, true) };
      } else if (scope === "outline" && type === 0x03f3) {
        outlineSlides.push([]);
      } else if (type === 0x0f9f) {
        textType = view.getUint32(body, true);
      } else if (type === 0x0fa0 || type === 0x0fa8) {
        const value = (type === 0x0fa0 ? unicode : latin).decode(stream.subarray(body, body + length));
        const entry = { title: textType === 0 || textType === 6, text: value };
        if (scope === "outline") outlineSlides.at(-1)?.push(entry);
        else if (scope === "drawing") drawingSlides.at(-1)?.push(entry);
        textType = null;
      }
      offset = body + length;
    }
  };
  walk(0, stream.length, "document");

  const count = Math.max(outlineSlides.length, drawingSlides.length);
  const slides = [];
  for (let index = 0; index < count; index += 1) {
    const entries = [...(outlineSlides[index] ?? [])];
    for (const extra of drawingSlides[index] ?? []) {
      if (!entries.some((entry) => entry.text === extra.text)) entries.push(extra);
    }
    slides.push(entries);
  }
  return { slides, size };
}

async function pptToPdf(file, onProgress) {
  const { slides, size } = pptSlides(await file.arrayBuffer());
  if (slides.every((entries) => entries.length === 0)) throw new Error("No text found in the PPT file.");
  const ratio = size.height / size.width || 0.75;
  const slideHeightPx = Math.round(SLIDE_WIDTH_PX * ratio);
  const rendered = slides.map((entries) => {
    const title = entries.find((entry) => entry.title);
    const body = entries.filter((entry) => entry !== title);
    const lines = (value) => value.split(/[\r\v]/).filter((line) => line.trim());
    const titleHtml = title
      ? `<div class="shape" style="left:48px;top:30px;width:${SLIDE_WIDTH_PX - 96}px;height:${Math.round(slideHeightPx * 0.2)}px;justify-content:center;font-size:34px;font-weight:700">${lines(title.text).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`
      : "";
    const bodyHtml = body.length
      ? `<div class="shape" style="left:64px;top:${Math.round(slideHeightPx * 0.27)}px;width:${SLIDE_WIDTH_PX - 128}px;height:${Math.round(slideHeightPx * 0.66)}px;font-size:21px;gap:8px">${body.flatMap((entry) => lines(entry.text)).map((line) => `<p>• ${escapeHtml(line)}</p>`).join("")}</div>`
      : "";
    return { background: "#fff", html: titleHtml + bodyHtml };
  });
  const widthMm = 254;
  return renderSlides(rendered, slideHeightPx, widthMm, widthMm * ratio, onProgress);
}

// ---------------------------------------------------------------------------
// 확장자별 변환기
// ---------------------------------------------------------------------------
const DOCUMENT_CONVERTERS = {
  htm: htmlToPdf,
  html: htmlToPdf,
  doc: docToPdf,
  docx: docxToPdf,
  rtf: rtfToPdf,
  odt: odtToPdf,
  xls: spreadsheetToPdf,
  xlsx: spreadsheetToPdf,
  ods: spreadsheetToPdf,
  ppt: pptToPdf,
  pptx: pptxToPdf,
  odp: odpToPdf,
};
