"use strict";

// ---------------------------------------------------------------------------
// PDF → DOCX / PPTX
//
// pdf.js로 페이지의 텍스트 조각(위치·크기·글꼴)을 읽어 줄 단위로 묶은 뒤,
//   DOCX: 줄을 문단으로 합쳐 편집 가능한 본문으로 만든다. 텍스트가 없는(스캔) 페이지는 페이지 이미지를 넣는다.
//   PPTX: 페이지 하나를 슬라이드 하나로 만든다. 글자를 뺀 페이지 그림을 배경에 깔고, 그 위에 줄마다 편집 가능한 텍스트 상자를 놓는다.
// OOXML 패키지는 JSZip으로 직접 조립한다.
// ---------------------------------------------------------------------------

const OOXML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const NS_PKG_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const EMU_PER_PT = 12700;
const TWIPS_PER_PT = 20;
const EAST_ASIAN_FONT = "Malgun Gothic";
const PAGE_IMAGE_SCALE = 150 / 72;
const MIN_TEXT_CHARS = 5;

function xmlEscape(value) {
  return String(value)
    // XML에 넣을 수 없는 제어 문자와 짝 없는 서로게이트를 지운다.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    // (뒤를 보는 정규식(lookbehind)은 Safari 16.4 미만에서 파일 전체를 못 읽게 하므로 쓰지 않는다: 짝이 맞는 쌍만 남긴다.)
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (match) => (match.length === 2 ? match : ""))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function relationshipsXml(relationships) {
  const items = relationships
    .map((rel) => `<Relationship Id="${rel.id}" Type="${REL_TYPE}/${rel.type}" Target="${rel.target}"/>`)
    .join("");
  return `${OOXML_HEADER}<Relationships xmlns="${NS_PKG_RELS}">${items}</Relationships>`;
}

function contentTypesXml(overrides) {
  const items = Object.entries(overrides)
    .map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`)
    .join("");
  return `${OOXML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Default Extension="png" ContentType="image/png"/>`
    + `<Default Extension="jpeg" ContentType="image/jpeg"/>`
    + `${items}</Types>`;
}

// ---------------------------------------------------------------------------
// PDF 페이지 → 줄
// line = { x, right, baseline, size, segments: [{ x, right, runs: [{ text, size, bold, italic, family }] }] }
// ---------------------------------------------------------------------------
function describeFont(page, fontName, styles) {
  let name = "";
  try {
    if (page.commonObjs.has(fontName)) name = page.commonObjs.get(fontName)?.name ?? "";
  } catch {
    name = "";
  }
  const label = `${name} ${styles[fontName]?.fontFamily ?? ""}`.toLowerCase();
  let family = "Arial";
  if (/mono|courier|consol/.test(label)) family = "Courier New";
  else if (/times|georgia|garamond|myungjo|batang|ming|song/.test(label) || (/serif/.test(label) && !/sans/.test(label))) family = "Times New Roman";
  return {
    bold: /bold|black|heavy|semibold|demi/.test(label),
    italic: /italic|oblique/.test(label),
    family,
  };
}

async function readPageLines(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // 글꼴 이름(굵게·기울임 판단용)은 연산 목록을 한 번 읽어야 commonObjs에 들어온다.
  await page.getOperatorList();

  const items = [];
  for (const item of content.items) {
    // 공백만 있는 조각은 버린다. 단어 사이 공백은 아래에서 조각 간격을 보고 다시 넣는다.
    // (표 칸 사이의 넓은 공백 조각이 칸을 하나로 이어 붙이는 것을 막는다.)
    if (!item.str?.trim()) continue;
    const transform = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const size = Math.hypot(transform[2], transform[3]);
    if (size < 1) continue;
    items.push({
      text: item.str,
      x: transform[4],
      right: transform[4] + item.width,
      baseline: transform[5],
      size,
      ...describeFont(page, item.fontName, content.styles),
    });
  }

  items.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows = [];
  for (const item of items) {
    const row = rows.at(-1);
    if (row && Math.abs(item.baseline - row.baseline) < Math.min(item.size, row.size) * 0.5) {
      row.items.push(item);
      row.size = Math.max(row.size, item.size);
    } else {
      rows.push({ baseline: item.baseline, size: item.size, items: [item] });
    }
  }

  const lines = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    const segments = [];
    for (const item of row.items) {
      let segment = segments.at(-1);
      const gap = segment ? item.x - segment.right : 0;
      if (!segment || gap > Math.max(item.size * 1.5, 12)) {
        segment = { x: item.x, right: item.right, runs: [] };
        segments.push(segment);
      } else if (gap > item.size * 0.15 && !/\s$/.test(segment.runs.at(-1)?.text ?? "") && !/^\s/.test(item.text)) {
        segment.runs.at(-1).text += " ";
      }
      const last = segment.runs.at(-1);
      if (last && last.bold === item.bold && last.italic === item.italic && last.family === item.family && Math.abs(last.size - item.size) < 0.5) {
        last.text += item.text;
      } else {
        segment.runs.push({ text: item.text, size: item.size, bold: item.bold, italic: item.italic, family: item.family });
      }
      segment.right = Math.max(segment.right, item.right);
    }
    const visible = segments.filter((segment) => segment.runs.some((run) => run.text.trim()));
    if (visible.length === 0) continue;
    lines.push({
      x: visible[0].x,
      right: visible.at(-1).right,
      baseline: row.baseline,
      size: Math.max(...visible.flatMap((segment) => segment.runs.map((run) => run.size))),
      segments: visible,
    });
  }
  return { lines, width: viewport.width, height: viewport.height };
}

function countCharacters(lines) {
  return lines.reduce((sum, line) => sum + line.segments.reduce((total, segment) => total + segment.runs.reduce((count, run) => count + run.text.trim().length, 0), 0), 0);
}

async function renderPageCanvas(page, { hideText = false } = {}) {
  const viewport = page.getViewport({ scale: PAGE_IMAGE_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const restoreFonts = hideText ? await hideGlyphPaths(page) : () => {};
  if (hideText) {
    // pdf.js는 글자를 fillText/strokeText로 그리므로, 이 둘을 막으면 글자를 뺀 페이지 그림이 남는다.
    context.fillText = () => {};
    context.strokeText = () => {};
  }
  try {
    await page.render({ canvasContext: context, viewport }).promise;
  } finally {
    restoreFonts();
  }
  return canvas;
}

// fillText를 쓰지 않고 글자 모양을 경로로 그리는 글꼴(Type3 글꼴 — 맥 Chrome이 한글 웹 페이지를 PDF로 저장하면 이렇게 된다 —
// 과 브라우저에 올리지 못한 글꼴)은 그리는 동안 글자 모양을 비워 둔다. 되돌리는 함수를 돌려준다.
async function hideGlyphPaths(page) {
  const { fnArray, argsArray } = await page.getOperatorList();
  const names = new Set(fnArray.flatMap((fn, index) => (fn === pdfjsLib.OPS.setFont ? [argsArray[index][0]] : [])));
  const restores = [];
  for (const name of names) {
    const font = page.commonObjs.has(name) ? page.commonObjs.get(name) : null;
    if (font?.charProcOperatorList) {
      const original = font.charProcOperatorList;
      font.charProcOperatorList = Object.fromEntries(Object.keys(original).map((id) => [id, { fnArray: [], argsArray: [], lastChunk: true }]));
      restores.push(() => { font.charProcOperatorList = original; });
    }
    if (font?.disableFontFace) {
      font.getPathGenerator = () => () => {};
      restores.push(() => { delete font.getPathGenerator; });
    }
  }
  return () => restores.forEach((restore) => restore());
}

function canvasPixels(canvas) {
  return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
}

// ---------------------------------------------------------------------------
// DOCX
// PDF 한 페이지 = DOCX 구역(섹션) 하나. 페이지 크기·방향을 그 PDF 페이지와 같게 한다.
//   배경: 글자를 뺀 페이지 전체 그림 한 장을 글자 뒤에 깐다. 사진·도형·배경색이 PDF와 같은 순서·모양으로 보인다.
//   글자: 항상 배경 앞에 온다. PDF의 줄바꿈을 그대로 두고 줄 높이·앞 간격으로 세로 위치를, 들여쓰기·탭으로 가로 위치를 맞춘다.
//         Word 글꼴이 PDF보다 넓어 줄이 넘칠 것 같으면 그 줄의 가로 비율(w:w)을 줄여, 줄이 늘어나 페이지가 밀리지 않게 한다.
//         앞 문단과 겹치는 문단(다단·옆 주석 등)은 흐름에 넣으면 아래로 밀리므로, 제자리에 고정한 텍스트 상자로 넣는다.
// ---------------------------------------------------------------------------
const NS_WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
const DOCX_MARGIN = 14;
// 페이지 시작·끝 표시용 문단의 줄 높이(twip). 흐름 공간을 거의 차지하지 않는다.
const DOCX_MARKER_LINE = 2;

function buildParagraphs(lines) {
  if (lines.length === 0) return [];
  const left = Math.min(...lines.map((line) => line.x));
  const right = Math.max(...lines.map((line) => line.right));
  const paragraphs = [];
  let current = null;
  for (const line of lines) {
    const previous = current?.lines.at(-1);
    const continues = previous
      && line.baseline - previous.baseline > 0
      // 맑은 고딕 등 한글 글꼴은 줄 간격이 글자 크기의 약 1.7배라서 여유를 둔다.
      && line.baseline - previous.baseline <= previous.size * 1.9
      && Math.abs(line.size - previous.size) < 1.5
      && previous.right > left + (right - left) * 0.75
      && Math.abs(line.x - previous.x) < previous.size * 3
      && previous.segments.length === 1
      && line.segments.length === 1;
    if (continues) current.lines.push(line);
    else {
      current = { lines: [line] };
      paragraphs.push(current);
    }
  }
  for (const paragraph of paragraphs) {
    const first = paragraph.lines[0];
    const last = paragraph.lines.at(-1);
    // PDF와 같은 세로 위치를 재현하려고 줄 높이와 문단 상자(top~bottom)를 PDF 좌표로 구해 둔다.
    const pitch = paragraph.lines.length > 1 ? (last.baseline - first.baseline) / (paragraph.lines.length - 1) : first.size * 1.2;
    paragraph.lineHeight = Math.max(pitch, first.size * 1.1);
    paragraph.top = first.baseline - paragraph.lineHeight * 0.8;
    paragraph.bottom = last.baseline + paragraph.lineHeight * 0.2;
    paragraph.left = Math.min(...paragraph.lines.map((line) => line.x));
    paragraph.right = Math.max(...paragraph.lines.map((line) => line.right));
  }
  return paragraphs;
}

let measureContext = null;

// Word가 쓸 글꼴(영문 run.family, 한글 맑은 고딕)로 글자 폭을 재 본다. 브라우저와 Word가 같은 시스템 글꼴을 쓴다.
function measureSegment(segment) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  return segment.runs.reduce((sum, run) => {
    // Mac에는 맑은 고딕이 없을 수 있어 Apple SD Gothic Neo로 대신 잰다.
    measureContext.font = `${run.italic ? "italic " : ""}${run.bold ? "bold " : ""}100px "${run.family}", "${EAST_ASIAN_FONT}", "Apple SD Gothic Neo", sans-serif`;
    return sum + (measureContext.measureText(run.text).width / 100) * run.size;
  }, 0);
}

// 조각이 쓸 수 있는 폭에 맞도록 가로 비율(%)을 구한다. 넘치지 않으면 100.
function fitScale(segment, availableWidth) {
  const width = measureSegment(segment);
  const limit = availableWidth * 0.97;
  return width <= limit ? 100 : Math.max(33, Math.floor((limit / width) * 100));
}

function docxRun(run, scale = 100) {
  const halfPoints = Math.max(2, Math.min(3276, Math.round(run.size * 2)));
  return `<w:r><w:rPr><w:rFonts w:ascii="${run.family}" w:hAnsi="${run.family}" w:cs="${run.family}" w:eastAsia="${EAST_ASIAN_FONT}"/>`
    + `${run.bold ? "<w:b/>" : ""}${run.italic ? "<w:i/>" : ""}${run.color && run.color !== "000000" ? `<w:color w:val="${run.color}"/>` : ""}`
    + `${scale < 100 ? `<w:w w:val="${scale}"/>` : ""}<w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr>`
    + `<w:t xml:space="preserve">${xmlEscape(run.text)}</w:t></w:r>`;
}

// 문단 하나. 줄마다 PDF 줄바꿈(w:br)을 두고, 줄 안의 조각(표의 칸·열)은 탭 정지로 가로 위치를 맞춘다.
function docxParagraph(paragraph, { spaceBefore = 0, originX = 0, textRight }) {
  const twips = (points) => Math.max(0, Math.round(points * TWIPS_PER_PT));
  const indent = paragraph.left - originX;
  const firstLine = paragraph.lines[0].x - paragraph.left;
  const tabStops = [...new Set(paragraph.lines.flatMap((line) => line.segments.slice(1).map((segment) => Math.round(segment.x - originX))))]
    .sort((a, b) => a - b);
  const properties = [
    tabStops.length ? `<w:tabs>${tabStops.map((position) => `<w:tab w:val="left" w:pos="${twips(position)}"/>`).join("")}</w:tabs>` : "",
    `<w:spacing w:before="${twips(spaceBefore)}" w:after="0" w:line="${twips(paragraph.lineHeight)}" w:lineRule="exact"/>`,
    `<w:ind w:left="${twips(indent)}" w:right="0"${firstLine > 1 ? ` w:firstLine="${twips(firstLine)}"` : ""}/>`,
  ].join("");
  const runs = paragraph.lines.map((line, lineIndex) => {
    let xml = line.segments.map((segment, index) => {
      const next = line.segments[index + 1];
      const scale = fitScale(segment, (next ? next.x - 2 : textRight) - segment.x);
      return (index > 0 ? "<w:r><w:tab/></w:r>" : "") + segment.runs.map((run) => docxRun(run, scale)).join("");
    }).join("");
    // 줄 끝 공백: 화면에는 보이지 않지만, 글을 복사하면 줄 사이 단어가 붙지 않게 한다.
    // 한글끼리 이어지는 줄은 PDF가 단어 중간에서 줄을 나눴을 수 있으므로 넣지 않는다.
    const nextLine = paragraph.lines[lineIndex + 1];
    if (nextLine) {
      const lastRun = line.segments.at(-1).runs.at(-1);
      const firstText = nextLine.segments[0].runs[0].text;
      const hangul = /[가-힣]/;
      if (!/\s$/.test(lastRun.text) && !(hangul.test(lastRun.text.at(-1)) && hangul.test(firstText.trimStart()[0] ?? ""))) {
        xml += docxRun({ ...lastRun, text: " " });
      }
    }
    return xml;
  }).join("<w:r><w:br/></w:r>");
  return `<w:p><w:pPr>${properties}</w:pPr>${runs}</w:p>`;
}

// 흐름 공간을 차지하지 않는 표시용 문단(페이지 시작: 배경·텍스트 상자 고정, 페이지 끝: 구역 나누기).
function docxMarkerParagraph(runs = "", sectionXml = "") {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${DOCX_MARKER_LINE}" w:lineRule="exact"/>${sectionXml}</w:pPr>${runs}</w:p>`;
}

function docxAnchorXml(id, box, graphicXml, { behindText }) {
  const emu = (points) => Math.round(points * EMU_PER_PT);
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251658240 + id}" behindDoc="${behindText ? 1 : 0}" locked="0" layoutInCell="1" allowOverlap="1">`
    + '<wp:simplePos x="0" y="0"/>'
    + `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.left)}</wp:posOffset></wp:positionH>`
    + `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.top)}</wp:posOffset></wp:positionV>`
    + `<wp:extent cx="${emu(box.width)}" cy="${emu(box.height)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
    + `<wp:docPr id="${id}" name="${behindText ? "Page background" : "Text"} ${id}"/><wp:cNvGraphicFramePr/>`
    + `<a:graphic xmlns:a="${NS_A}">${graphicXml}</a:graphic></wp:anchor></w:drawing></w:r>`;
}

function docxPictureAnchor(id, relationshipId, box) {
  const emu = (points) => Math.round(points * EMU_PER_PT);
  const graphic = `<a:graphicData uri="${NS_PIC}"><pic:pic xmlns:pic="${NS_PIC}">`
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="page${id}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + "</pic:pic></a:graphicData>";
  return docxAnchorXml(id, box, graphic, { behindText: true });
}

// 제자리에 고정한 텍스트 상자(테두리·채우기 없음). 안의 글자는 그대로 편집할 수 있다.
function docxTextBoxAnchor(id, paragraph, textRight) {
  const emu = (points) => Math.round(points * EMU_PER_PT);
  const box = {
    left: paragraph.left,
    top: paragraph.top,
    width: Math.max(paragraph.right, textRight) - paragraph.left,
    height: paragraph.bottom - paragraph.top,
  };
  const content = docxParagraph(paragraph, { spaceBefore: 0, originX: paragraph.left, textRight });
  const graphic = `<a:graphicData uri="${NS_WPS}"><wps:wsp xmlns:wps="${NS_WPS}"><wps:cNvSpPr txBox="1"/>`
    + `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>`
    + `<wps:txbx><w:txbxContent>${content}</w:txbxContent></wps:txbx>`
    + '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0"><a:noAutofit/></wps:bodyPr>'
    + "</wps:wsp></a:graphicData>";
  return docxAnchorXml(id, box, graphic, { behindText: false });
}

// 글자 영역마다 "글자 포함 그림"과 "글자 뺀 그림"을 비교해 글자색을 정한다.
function colorLines(lines, fullPixels, backgroundPixels, canvasWidth, canvasHeight) {
  for (const line of lines) {
    for (const segment of line.segments) {
      segment.color = sampleTextColor(fullPixels, backgroundPixels, canvasWidth, canvasHeight, {
        left: segment.x * PAGE_IMAGE_SCALE,
        right: segment.right * PAGE_IMAGE_SCALE,
        top: (line.baseline - line.size * 0.85) * PAGE_IMAGE_SCALE,
        bottom: (line.baseline + line.size * 0.2) * PAGE_IMAGE_SCALE,
      });
      for (const run of segment.runs) run.color = segment.color;
    }
  }
}

const DOCX_STYLES = `${OOXML_HEADER}<w:styles xmlns:w="${NS_W}"><w:docDefaults>`
  + `<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="${EAST_ASIAN_FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault>`
  // 한글과 숫자·영문 사이에 Word가 자동으로 넣는 간격을 끈다(PDF에는 없는 간격이라 "1페이지"가 "1 페이지"처럼 보인다).
  + `<w:pPrDefault><w:pPr><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
  + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;

async function pdfToDocx(file, onProgress) {
  const pdf = await openPdf(file);
  const zip = new JSZip();
  const body = [];
  const relationships = [{ id: "rId1", type: "styles", target: "styles.xml" }];
  const twips = (points) => Math.round(points * TWIPS_PER_PT);
  let objectId = 0;
  let sectionXml = "";
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Converting page ${pageNumber}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const { lines, width, height } = await readPageLines(page);
      const scanned = countCharacters(lines) < MIN_TEXT_CHARS;
      const textRight = width - DOCX_MARGIN;

      // 배경: 글자를 뺀 페이지 전체 그림(스캔 페이지는 글자까지 포함한 그림).
      const background = await renderPageCanvas(page, { hideText: !scanned });
      const backgroundPixels = canvasPixels(background);
      let pageStartRuns = "";
      if (!isBlank(backgroundPixels)) {
        objectId += 1;
        const mediaName = `page${pageNumber}.jpeg`;
        zip.file(`word/media/${mediaName}`, await canvasToBlob(background, "image/jpeg", 0.9));
        const relationshipId = `rId${relationships.length + 1}`;
        relationships.push({ id: relationshipId, type: "image", target: `media/${mediaName}` });
        pageStartRuns += docxPictureAnchor(objectId, relationshipId, { left: 0, top: 0, width, height });
      }

      const flowed = [];
      if (!scanned) {
        colorLines(lines, canvasPixels(await renderPageCanvas(page)), backgroundPixels, background.width, background.height);
        let flowBottom = DOCX_MARGIN + DOCX_MARKER_LINE / TWIPS_PER_PT;
        for (const paragraph of buildParagraphs(lines)) {
          if (paragraph.top >= flowBottom - 1) {
            flowed.push(docxParagraph(paragraph, { spaceBefore: paragraph.top - flowBottom, originX: DOCX_MARGIN, textRight }));
            flowBottom = paragraph.bottom;
          } else {
            objectId += 1;
            pageStartRuns += docxTextBoxAnchor(objectId, paragraph, textRight);
          }
        }
      }

      // 이 페이지의 구역 설정. 다음 페이지가 있으면 페이지 끝 문단에 넣어 구역을 나눈다.
      sectionXml = `<w:sectPr><w:pgSz w:w="${twips(width)}" w:h="${twips(height)}"${width > height ? ' w:orient="landscape"' : ""}/>`
        + `<w:pgMar w:top="${twips(DOCX_MARGIN)}" w:right="${twips(DOCX_MARGIN)}" w:bottom="0" w:left="${twips(DOCX_MARGIN)}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
      body.push(docxMarkerParagraph(pageStartRuns), ...flowed);
      if (pageNumber < pdf.numPages) body.push(docxMarkerParagraph("", sectionXml));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  zip.file("[Content_Types].xml", contentTypesXml({
    "/word/document.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    "/word/styles.xml": "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml",
  }));
  zip.file("_rels/.rels", relationshipsXml([{ id: "rId1", type: "officeDocument", target: "word/document.xml" }]));
  zip.file("word/_rels/document.xml.rels", relationshipsXml(relationships));
  zip.file("word/styles.xml", DOCX_STYLES);
  zip.file("word/document.xml", `${OOXML_HEADER}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:wp="${NS_WP}"><w:body>${body.join("")}${sectionXml}</w:body></w:document>`);
  return zip.generateAsync({ type: "blob", mimeType: OUTPUT_MIME.docx, compression: "DEFLATE" });
}

// ---------------------------------------------------------------------------
// PPTX
// ---------------------------------------------------------------------------
const PPTX_THEME = (() => {
  const colors = { dk1: "000000", lt1: "FFFFFF", dk2: "44546A", lt2: "E7E6E6", accent1: "4472C4", accent2: "ED7D31", accent3: "A5A5A5", accent4: "FFC000", accent5: "5B9BD5", accent6: "70AD47", hlink: "0563C1", folHlink: "954F72" };
  const scheme = Object.entries(colors).map(([name, value]) => `<a:${name}><a:srgbClr val="${value}"/></a:${name}>`).join("");
  const fonts = `<a:latin typeface="Arial"/><a:ea typeface="${EAST_ASIAN_FONT}"/><a:cs typeface="Arial"/>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = `<a:ln w="6350">${fill}</a:ln>`;
  return `${OOXML_HEADER}<a:theme xmlns:a="${NS_A}" name="DropPDF"><a:themeElements>`
    + `<a:clrScheme name="DropPDF">${scheme}</a:clrScheme>`
    + `<a:fontScheme name="DropPDF"><a:majorFont>${fonts}</a:majorFont><a:minorFont>${fonts}</a:minorFont></a:fontScheme>`
    + `<a:fmtScheme name="DropPDF"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst>`
    + `<a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme>`
    + "</a:themeElements></a:theme>";
})();

const PPTX_EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
  + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const PPTX_ROOT_NS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;

const PPTX_MASTER = `${OOXML_HEADER}<p:sldMaster ${PPTX_ROOT_NS}><p:cSld>`
  + '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
  + `<p:spTree>${PPTX_EMPTY_TREE}</p:spTree></p:cSld>`
  + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
  + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
  + '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles>'
  + "</p:sldMaster>";

const PPTX_LAYOUT = `${OOXML_HEADER}<p:sldLayout ${PPTX_ROOT_NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${PPTX_EMPTY_TREE}</p:spTree></p:cSld>`
  + "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";

// 글자가 있는 영역에서 "글자 포함 그림"과 "글자 뺀 그림"이 가장 다른 픽셀을 글자색으로 본다.
function sampleTextColor(full, background, canvasWidth, canvasHeight, box) {
  const x0 = Math.max(0, Math.floor(box.left));
  const x1 = Math.min(canvasWidth - 1, Math.ceil(box.right));
  const y0 = Math.max(0, Math.floor(box.top));
  const y1 = Math.min(canvasHeight - 1, Math.ceil(box.bottom));
  let best = 0;
  let color = "000000";
  const step = Math.max(1, Math.floor((x1 - x0) / 400));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += step) {
      const offset = (y * canvasWidth + x) * 4;
      const difference = Math.abs(full[offset] - background[offset]) + Math.abs(full[offset + 1] - background[offset + 1]) + Math.abs(full[offset + 2] - background[offset + 2]);
      if (difference > best) {
        best = difference;
        color = [full[offset], full[offset + 1], full[offset + 2]].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase();
      }
    }
  }
  return best > 60 ? color : "000000";
}

function isBlank(pixels) {
  for (let offset = 0; offset < pixels.length; offset += 16) {
    if (pixels[offset] < 248 || pixels[offset + 1] < 248 || pixels[offset + 2] < 248) return false;
  }
  return true;
}

function pptxTextBox(id, segment, line, placement, color) {
  const toEmu = (points) => Math.round(points * placement.scale * EMU_PER_PT);
  const x = placement.offsetX + toEmu(segment.x);
  const y = placement.offsetY + toEmu(line.baseline - line.size * 0.95);
  const width = Math.max(toEmu((segment.right - segment.x) * 1.08 + line.size * 0.5), EMU_PER_PT);
  const height = Math.max(toEmu(line.size * 1.3), EMU_PER_PT);
  const runs = segment.runs.map((run) => {
    const size = Math.max(100, Math.min(400000, Math.round(run.size * placement.scale * 100)));
    return `<a:r><a:rPr lang="en-US" sz="${size}" b="${run.bold ? 1 : 0}" i="${run.italic ? 1 : 0}" dirty="0">`
      + `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${run.family}"/><a:ea typeface="${EAST_ASIAN_FONT}"/><a:cs typeface="${run.family}"/></a:rPr>`
      + `<a:t>${xmlEscape(run.text)}</a:t></a:r>`;
  }).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
    + '<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>'
    + `<a:p>${runs}</a:p></p:txBody></p:sp>`;
}

async function pdfToPptx(file, onProgress) {
  const pdf = await openPdf(file);
  const zip = new JSZip();
  const slides = [];
  let slideWidth = 0;
  let slideHeight = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress(`Building slide ${pageNumber}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNumber);
      const { lines, width, height } = await readPageLines(page);
      if (pageNumber === 1) {
        // PowerPoint 슬라이드 크기 허용 범위: 1~56인치
        const clamp = (value) => Math.max(914400, Math.min(51206400, Math.round(value * EMU_PER_PT)));
        slideWidth = clamp(width);
        slideHeight = clamp(height);
      }
      const scale = Math.min(slideWidth / (width * EMU_PER_PT), slideHeight / (height * EMU_PER_PT));
      const placement = {
        scale,
        offsetX: Math.round((slideWidth - width * EMU_PER_PT * scale) / 2),
        offsetY: Math.round((slideHeight - height * EMU_PER_PT * scale) / 2),
      };

      const hasText = countCharacters(lines) > 0;
      const background = await renderPageCanvas(page, { hideText: hasText });
      const backgroundPixels = canvasPixels(background);
      const fullPixels = hasText ? canvasPixels(await renderPageCanvas(page)) : backgroundPixels;

      const relationships = [{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }];
      let shapes = "";
      let shapeId = 2;
      if (!isBlank(backgroundPixels)) {
        const mediaName = `page${pageNumber}.jpeg`;
        zip.file(`ppt/media/${mediaName}`, await canvasToBlob(background, "image/jpeg", 0.9));
        relationships.push({ id: "rId2", type: "image", target: `../media/${mediaName}` });
        const pictureWidth = Math.round(width * EMU_PER_PT * scale);
        const pictureHeight = Math.round(height * EMU_PER_PT * scale);
        shapes += `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="Page ${pageNumber}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
          + '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
          + `<p:spPr><a:xfrm><a:off x="${placement.offsetX}" y="${placement.offsetY}"/><a:ext cx="${pictureWidth}" cy="${pictureHeight}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
        shapeId += 1;
      }
      colorLines(lines, fullPixels, backgroundPixels, background.width, background.height);
      for (const line of lines) {
        for (const segment of line.segments) {
          shapes += pptxTextBox(shapeId, segment, line, placement, segment.color);
          shapeId += 1;
        }
      }
      slides.push({
        xml: `${OOXML_HEADER}<p:sld ${PPTX_ROOT_NS}><p:cSld><p:spTree>${PPTX_EMPTY_TREE}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
        relationships,
      });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const overrides = {
    "/ppt/presentation.xml": "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    "/ppt/slideMasters/slideMaster1.xml": "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
    "/ppt/slideLayouts/slideLayout1.xml": "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
    "/ppt/theme/theme1.xml": "application/vnd.openxmlformats-officedocument.theme+xml",
  };
  const presentationRels = [
    { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
    { id: "rId2", type: "theme", target: "theme/theme1.xml" },
  ];
  let slideIds = "";
  slides.forEach((slide, index) => {
    const number = index + 1;
    overrides[`/ppt/slides/slide${number}.xml`] = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
    presentationRels.push({ id: `rId${number + 2}`, type: "slide", target: `slides/slide${number}.xml` });
    slideIds += `<p:sldId id="${255 + number}" r:id="rId${number + 2}"/>`;
    zip.file(`ppt/slides/slide${number}.xml`, slide.xml);
    zip.file(`ppt/slides/_rels/slide${number}.xml.rels`, relationshipsXml(slide.relationships));
  });

  zip.file("[Content_Types].xml", contentTypesXml(overrides));
  zip.file("_rels/.rels", relationshipsXml([{ id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" }]));
  zip.file("ppt/presentation.xml", `${OOXML_HEADER}<p:presentation ${PPTX_ROOT_NS} saveSubsetFonts="1">`
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + `<p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${slideWidth}" cy="${slideHeight}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", relationshipsXml(presentationRels));
  zip.file("ppt/slideMasters/slideMaster1.xml", PPTX_MASTER);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", relationshipsXml([
    { id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" },
    { id: "rId2", type: "theme", target: "../theme/theme1.xml" },
  ]));
  zip.file("ppt/slideLayouts/slideLayout1.xml", PPTX_LAYOUT);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", relationshipsXml([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }]));
  zip.file("ppt/theme/theme1.xml", PPTX_THEME);
  return zip.generateAsync({ type: "blob", mimeType: OUTPUT_MIME.pptx, compression: "DEFLATE" });
}
