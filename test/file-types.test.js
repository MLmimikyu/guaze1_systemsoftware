import assert from "node:assert/strict";
import { test } from "node:test";

import { getConvertedOutputName, getFileKind, getOutputName } from "../src/file-types.js";

test("supported files are classified without regard to case", () => {
  assert.equal(getFileKind("photo.JPG"), "image");
  assert.equal(getFileKind("notes.txt"), "text");
  assert.equal(getFileKind("report.HTML"), "html");
  assert.equal(getFileKind("report.docx"), "office");
  assert.equal(getFileKind("archive.zip"), "unsupported");
});

test("PDF conversion output names use the selected format", () => {
  assert.equal(getConvertedOutputName("C:\\files\\scan.final.pdf", "PNG"), "scan.final.png");
  assert.throws(() => getConvertedOutputName("scan.pdf", "exe"));
});

test("output names retain the original stem", () => {
  assert.equal(getOutputName("C:\\files\\quarterly.report.docx"), "quarterly.report.pdf");
});
