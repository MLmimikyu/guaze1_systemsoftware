const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("dropPdf", {
  getCapabilities: () => ipcRenderer.invoke("app:capabilities"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  selectFiles: (mode) => ipcRenderer.invoke("files:select", mode),
  selectOutputDirectory: () => ipcRenderer.invoke("folder:select"),
  convertFile: (inputPath, outputDirectory) =>
    ipcRenderer.invoke("file:convert", inputPath, outputDirectory),
  convertPdf: (inputPath, outputDirectory, outputFormat) =>
    ipcRenderer.invoke("pdf:convert", inputPath, outputDirectory, outputFormat),
  showFile: (outputPath) => ipcRenderer.invoke("file:show", outputPath),
});
