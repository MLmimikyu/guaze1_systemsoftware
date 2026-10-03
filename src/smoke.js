import path from "node:path";
import { pathToFileURL } from "node:url";

import { mkdir, writeFile } from "node:fs/promises";

import { app, BrowserWindow, ipcMain } from "electron";

import { convertFile } from "./converter.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const inputPath = path.join(projectRoot, "test", "fixtures", "verification-sample.txt");
const outputDirectory = path.join(projectRoot, "output", "pdf");

app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  try {
    process.env.DROP_PDF_SMOKE_INPUT = inputPath;
    let resolveRevealedPath;
    const revealedPathPromise = new Promise((resolve) => {
      resolveRevealedPath = resolve;
    });
    ipcMain.handle("app:capabilities", () => ({ office: false }));
    ipcMain.handle("file:convert", (_event, sourcePath, requestedDirectory) =>
      convertFile(sourcePath, requestedDirectory || outputDirectory),
    );
    ipcMain.handle("file:show", (_event, outputPath) => {
      resolveRevealedPath(outputPath);
      return true;
    });
    const previewWindow = new BrowserWindow({
      width: 1040,
      height: 960,
      show: false,
      webPreferences: {
        preload: path.join(projectRoot, "src", "smoke-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    await previewWindow.loadURL(
      pathToFileURL(path.join(projectRoot, "src", "renderer", "index.html")).href,
    );
    await previewWindow.webContents.executeJavaScript(`
      (() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(["DropPDF smoke test"], "verification-sample.txt", { type: "text/plain" }));
        document.querySelector("#drop-zone").dispatchEvent(new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }));
      })()
    `);
    const outputPath = await Promise.race([
      revealedPathPromise,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("자동 변환 후 위치 표시가 호출되지 않았습니다.")), 15000),
      ),
    ]);
    console.log(`SMOKE_AUTO_REVEAL=${outputPath}`);
    const screenshot = await previewWindow.webContents.capturePage();
    const screenshotPath = path.join(projectRoot, "tmp", "pdfs", "drop-pdf-ui.png");
    await mkdir(path.dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, screenshot.toPNG());
    console.log(`SMOKE_UI=${screenshotPath}`);
    previewWindow.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
