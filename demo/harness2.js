// 데모 영상 보충 녹화: brochure 줄을 PowerPoint로 바꾸고 Convert 누르는 장면.
function sampleFile(name) {
  const bin = atob(window.SAMPLES[name]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

window.setupScene = async () => {
  try { await recordStore.clear(); } catch {}
  await renderRecords();
  enqueueFiles(["report.docx", "sales.xlsx", "trip-photos.zip", "brochure.pdf"].map(sampleFile));
  await startConversion();
  await renderRecords();
  const zone = document.getElementById("drop-zone");
  window.scrollTo(0, zone.getBoundingClientRect().top + window.scrollY - 11.5);

  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  cursor.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M1 1 L1 24 L7 18 L11 28 L15 26 L11 16 L19 16 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, { position: "fixed", left: "760px", top: "640px", zIndex: 9999, pointerEvents: "none", transition: "left .8s ease-in-out, top .8s ease-in-out" });
  document.body.append(cursor);
  const box = document.createElement("div");
  box.id = "demo-box";
  Object.assign(box.style, { position: "fixed", border: "3px solid #f5c400", borderRadius: "3px", zIndex: 9998, pointerEvents: "none", display: "none" });
  document.body.append(box);
  window.sceneDone = false;
  return "ready";
};

function brochureRow() {
  return [...document.querySelectorAll("#queue tr")].find((tr) => tr.textContent.includes("brochure.pdf"));
}
function center(el) { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
async function moveTo(el) {
  const [x, y] = center(el); const c = document.getElementById("demo-cursor");
  c.style.left = `${x - 2}px`; c.style.top = `${y - 2}px`; await sleep(900);
}
function boxAround(el) {
  const r = el.getBoundingClientRect(); const b = document.getElementById("demo-box");
  Object.assign(b.style, { display: "block", left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
}
async function clickPulse() {
  const c = document.getElementById("demo-cursor");
  c.style.transform = "scale(0.85)"; await sleep(120); c.style.transform = "";
}

window.playScene = async () => {
  await sleep(700);
  let select = brochureRow().querySelector("select");
  boxAround(select);
  await moveTo(select);
  await clickPulse();
  select.value = "pptx";
  select.dispatchEvent(new Event("change"));
  select = brochureRow().querySelector("select");
  boxAround(select);
  await sleep(1000);
  const convertBtn = [...brochureRow().querySelectorAll("button")].find((b) => b.textContent === "Convert");
  boxAround(brochureRow());
  await moveTo(convertBtn);
  await clickPulse();
  const item = queue.find((q) => q.file.name === "brochure.pdf");
  const done = convertOne(item);
  await done;
  await renderRecords();
  await sleep(1500);
  document.getElementById("demo-box").style.display = "none";
  await sleep(800);
  window.sceneDone = true;
};
