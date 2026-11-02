const { contextBridge, ipcRenderer } = require("electron");

async function invoke(channel, ...args) {
  try { return await ipcRenderer.invoke(channel, ...args); }
  catch (error) {
    const message = String(error?.message || "Aktion fehlgeschlagen.")
      .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
    throw new Error(message);
  }
}

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  getLanguage: () => invoke("settings:get-language"),
  getVersion: () => invoke("app:version"),
  setLanguage: (language) => invoke("settings:set-language", language),
  getSettingsWarning: () => invoke("settings:get-warning"),
  getPaths: () => invoke("settings:get-paths"),
  choosePath: (kind) => invoke("settings:choose-path", kind),
  resetPaths: () => invoke("settings:reset-paths"),
  analyzeAndConvert: (payload) => invoke("converter:analyze", payload),
  getSchemas: () => invoke("converter:schemas"),
  studioDetect: (payload) => invoke("studio:detect", payload),
  studioCatalog: (payload) => invoke("studio:catalog", payload),
  studioEncode: (payload) => invoke("studio:encode", payload),
  studioPalette: (payload) => invoke("studio:palette", payload),
  libraryList: () => invoke("library:list"),
  libraryExport: () => invoke("library:export"),
  libraryExportEntry: (id) => invoke("library:export-entry", id),
  libraryImport: () => invoke("library:import"),
  librarySave: (payload) => invoke("library:save", payload),
  libraryUpdate: (id, changes) => invoke("library:update", id, changes),
  libraryRemove: (id) => invoke("library:remove", id),
  libraryCheck: (payload) => invoke("library:check", payload),
  libraryApply: (payload) => invoke("library:apply", payload),
  libraryPortrait: (id) => invoke("library:portrait", id),
  libraryPortraitSet: (id, bytes) => invoke("library:portrait-set", id, bytes),
  libraryPortraitChoose: (id) => invoke("library:portrait-choose", id),
  libraryPortraitPaste: (id) => invoke("library:portrait-paste", id),
  portraitChoose: () => invoke("library:portrait-choose"),
  portraitPaste: () => invoke("library:portrait-paste"),
  gameStatus: () => invoke("game:status"),
  gameRead: () => invoke("game:read"),
  gameCopy: () => invoke("game:copy"),
  gamePaste: (expectedTarget) => invoke("game:paste", expectedTarget),
  copyText: (value) => invoke("clipboard:write-text", value),
  readText: () => invoke("clipboard:read-text"),
  loadInputFromFile: () => invoke("dialog:load-input-file"),
  saveOutputToFile: (payload) => invoke("dialog:save-output-file", payload)
});
