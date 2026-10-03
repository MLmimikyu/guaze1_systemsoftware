const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dropPdf", {
  getCapabilities: () => ipcRenderer.invoke("app:capabilities"),
  getPathForFile: () => process.env.DROP_PDF_SMOKE_INPUT,
  selectFiles: () => Promise.resolve([]),
  selectOutputDirectory: () => Promise.resolve(null),
  convertFile: (inputPath, outputDirectory) =>
    ipcRenderer.invoke("file:convert", inputPath, outputDirectory),
  showFile: (outputPath) => ipcRenderer.invoke("file:show", outputPath),
});
