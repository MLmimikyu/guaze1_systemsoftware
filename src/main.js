import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

import { convertFile, getCapabilities } from "./converter.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#f3f0e8",
    title: "DropPDF",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadURL(pathToFileURL(path.join(currentDirectory, "renderer", "index.html")).href);
}

app.whenReady().then(() => {
  ipcMain.handle("files:select", async () => {
    const result = await dialog.showOpenDialog({
      title: "PDF로 변환할 파일 선택",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "지원 파일",
          extensions: [
            "bmp", "gif", "jpeg", "jpg", "png", "webp",
            "log", "md", "text", "txt", "htm", "html",
            "doc", "docx", "odp", "ods", "odt", "ppt", "pptx", "rtf", "xls", "xlsx",
          ],
        },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("folder:select", async () => {
    const result = await dialog.showOpenDialog({
      title: "PDF 저장 폴더 선택",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("app:capabilities", () => getCapabilities());
  ipcMain.handle("file:convert", (_event, inputPath, outputDirectory) =>
    convertFile(inputPath, outputDirectory),
  );
  ipcMain.handle("file:show", (_event, outputPath) => shell.showItemInFolder(outputPath));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
