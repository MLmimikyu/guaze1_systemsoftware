const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("dropPdf", {
  getCapabilities: () => ipcRenderer.invoke("app:capabilities"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  selectFiles: () => ipcRenderer.invoke("files:select"),
  selectOutputDirectory: () => ipcRenderer.invoke("folder:select"),
  convertFile: (inputPath, outputDirectory) =>
    ipcRenderer.invoke("file:convert", inputPath, outputDirectory),
  showFile: (outputPath) => ipcRenderer.invoke("file:show", outputPath),
});
