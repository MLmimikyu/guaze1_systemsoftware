import assert from "node:assert/strict";
import { test } from "node:test";

import { getFileKind, getOutputName } from "../src/file-types.js";

test("supported files are classified without regard to case", () => {
  assert.equal(getFileKind("photo.JPG"), "image");
  assert.equal(getFileKind("notes.txt"), "text");
  assert.equal(getFileKind("report.HTML"), "html");
  assert.equal(getFileKind("report.docx"), "office");
  assert.equal(getFileKind("archive.zip"), "unsupported");
});

test("output names retain the original stem", () => {
  assert.equal(getOutputName("C:\\files\\quarterly.report.docx"), "quarterly.report.pdf");
});
