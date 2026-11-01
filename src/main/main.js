const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, Menu } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { runPythonBridge: runBackend, stopPythonBridge, restartPythonBridge } = require("./python-bridge");
const { LibraryStore, LIMITS } = require("./library-store");
const { LanguageSettings } = require("./language-settings");
const { PathSettings } = require("./path-settings");
const { randomUUID } = require("crypto");
const { studioPayload } = require('./studio-input');
const { managerToBundle, MANAGER_FORMAT } = require('./manager-import');
let languageSettings, pathSettings, library, shutdownStarted = false, pathsChanging = false;
const activeMutations = new Set();
const originalGenePaths = Object.fromEntries(['CK3_GENES_DIR', 'CK3_EPE_GENES_DIR', 'CK3_AGOT_GENES_DIR'].map(key => [key, process.env[key]]));
function ui(de, en) { return languageSettings?.language === "de" ? de : en; }
function runPythonBridge(payload) {
  if (shutdownStarted || pathsChanging) return Promise.reject(new Error(ui("Bitte den laufenden Vorgang abwarten.", "Please wait for the current operation to finish.")));
  return runBackend(payload);
}
function handleMutation(channel, action) {
  ipcMain.handle(channel, (...args) => {
    if (shutdownStarted) throw new Error(ui("Die App wird beendet.", "The app is closing."));
    const operation = Promise.resolve().then(() => action(...args));
    activeMutations.add(operation);
    operation.then(() => activeMutations.delete(operation), () => activeMutations.delete(operation));
    return operation;
  });
}
function applyPaths() {
  for (const [kind, key] of [['game','CK3_GENES_DIR'],['epe','CK3_EPE_GENES_DIR'],['agot','CK3_AGOT_GENES_DIR']]) {
    const root = pathSettings.paths[kind];
    if (root) process.env[key] = path.join(root, 'common/genes');
    else if (originalGenePaths[key]) process.env[key] = originalGenePaths[key];
    else delete process.env[key];
  }
}
async function changePaths(paths) {
  if (pathsChanging) throw new Error(ui("Bitte den laufenden Vorgang abwarten.", "Please wait for the current operation to finish."));
  pathsChanging = true;
  try { await restartPythonBridge(); const result = await pathSettings.save(paths); applyPaths(); return result; }
  finally { pathsChanging = false; }
}
async function writeExport(file, text) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, text, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}

const isMac = process.platform === "darwin";
// Set identity and profile before taking the lock so Studio and Converter coexist.
app.setName("Crusader Kings III DNA Studio");
app.setPath("userData", process.env.CK3_STUDIO_TEST_USER_DATA || process.env.CK3_CONVERTER_TEST_USER_DATA || path.join(app.getPath("appData"), "ck3-dna-studio"));
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
});

function normalizePortrait(bytes) {
  const buffer = Buffer.from(bytes);
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error("Bitte ein Bild mit höchstens 12 MB auswählen.");
  const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = buffer.toString("ascii",0,4)==="RIFF" && buffer.toString("ascii",8,12)==="WEBP";
  if (!png && !jpeg && !webp) throw new Error("Unterstützt werden PNG-, JPEG- und WebP-Bilder.");
  let image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) throw new Error("Das Bild konnte nicht gelesen werden.");
  let {width,height} = image.getSize();
  if (width > 12000 || height > 12000) throw new Error("Das Bild ist zu groß. Bitte eine kleinere Fassung verwenden.");
  if (Math.max(width,height)>1600) {
    const factor=1600/Math.max(width,height); width=Math.max(1,Math.round(width*factor));height=Math.max(1,Math.round(height*factor));
    image=image.resize({width,height,quality:"best"});
  }
  const data=image.toPNG();
  if (data.length>8*1024*1024) throw new Error("Das Bild ist nach dem Einlesen zu groß.");
  return {data,width,height};
}

function getAssetPath(fileName) {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "assets", fileName);
  }

  return path.resolve(__dirname, "../../assets", fileName);
}

function createMainWindow() {
  const iconPath = getAssetPath("icon.ico");
  const appIcon = nativeImage.createFromPath(iconPath);

  const mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1240,
    minHeight: 780,
    show: false,
    backgroundColor: "#080e0b",
    title: "Crusader Kings III DNA Studio",
    autoHideMenuBar: true,
    icon: appIcon.isEmpty() ? iconPath : appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  mainWindow.loadFile(path.resolve(__dirname, "../renderer/index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
}

app.whenReady().then(async () => {
  if (!primaryInstance) return;
  if (process.platform === "win32") {
    app.setAppUserModelId("com.ck3dnastudio.desktop");
  }
  Menu.setApplicationMenu(null);
  languageSettings = new LanguageSettings(path.join(app.getPath("userData"), "ui-language.json"));
  await languageSettings.load();
  pathSettings = new PathSettings(path.join(app.getPath("userData"), "installation-paths.json"));
  await pathSettings.load(); applyPaths();
  ipcMain.handle("settings:get-language", () => languageSettings.language);
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("settings:get-warning", () => [languageSettings.warning, pathSettings.warning].filter(Boolean).join('\n') || null);
  handleMutation("settings:set-language", (_event, language) => languageSettings.set(language));
  ipcMain.handle("settings:get-paths", () => ({ ...pathSettings.paths }));
  handleMutation("settings:choose-path", async (_event, kind) => {
    if (!['game','epe','agot'].includes(kind)) throw new Error('Invalid installation folder.');
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: ui("Installationsordner auswählen", "Choose installation folder"), properties: ['openDirectory'], defaultPath: pathSettings.paths[kind] || undefined
    });
    if (result.canceled || !result.filePaths.length) return null;
    const root = await pathSettings.normalize(kind, result.filePaths[0]);
    return changePaths({ ...pathSettings.paths, [kind]: root });
  });
  handleMutation("settings:reset-paths", () => changePaths({ game: '', epe: '', agot: '' }));
  library = new LibraryStore(path.join(app.getPath("userData"), "dna-library.json"));
  ipcMain.handle("library:list", () => library.list());
  handleMutation("library:save", (_event, payload) => library.save(payload));
  handleMutation("library:update", (_event, id, changes) => library.update(id, changes));
  handleMutation("library:remove", (_event, id) => library.remove(id));
  handleMutation("library:export", async () => {
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: ui("DNA-Bibliothek exportieren", "Export DNA library"), defaultPath: 'CK3-DNA-Library.ck3dna', filters: [{ name: 'CK3 DNA Library', extensions: ['ck3dna'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const text = JSON.stringify(await library.exportBundle());
    if (Buffer.byteLength(text, 'utf8') > LIMITS.fileBytes) throw new Error(ui("Das Bibliothekspaket ist zu groß.", "The library package is too large."));
    await writeExport(result.filePath, text);
    return { canceled: false };
  });
  handleMutation("library:export-entry", async (_event, id) => {
    if (typeof id !== 'string') throw new Error('Select a library entry to export.');
    const bundle = await library.exportBundle(id);
    const name = bundle.entries[0].name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100);
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: ui("DNA-Eintrag exportieren", "Export DNA entry"), defaultPath: `${name || 'CK3-DNA'}.ck3dna`, filters: [{ name: 'CK3 DNA Library', extensions: ['ck3dna'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await writeExport(result.filePath, JSON.stringify(bundle));
    return { canceled: false };
  });
  handleMutation("library:import", async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title: ui("DNA-Bibliothek importieren", "Import DNA library"), properties: ['openFile'], filters: [{ name: 'CK3 DNA Library', extensions: ['ck3dna','json'] }]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const file = result.filePaths[0];
    if ((await fs.stat(file)).size > LIMITS.fileBytes) throw new Error(ui("Das Bibliothekspaket ist zu groß.", "The library package is too large."));
    let bundle;
    try { bundle = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error instanceof SyntaxError) throw new Error(ui("Das Bibliothekspaket enthält kein gültiges JSON.", "The library package contains invalid JSON.")); throw error; }
    let archivedCount = 0;
    const sourceFormat = bundle?.format;
    if (sourceFormat === MANAGER_FORMAT) {
      const converted = await managerToBundle(bundle, {
        detect: text => runPythonBridge(studioPayload('studio_detect', { text, profile: 'auto' })), normalizePortrait
      });
      bundle = converted.bundle;
      archivedCount = converted.archivedCount;
    }
    return { canceled: false, ...await library.importBundle(bundle), sourceFormat, archivedCount };
  });
  const setPortrait = async (id, bytes) => {
    const image=normalizePortrait(bytes);
    return library.setPortrait(id,image.data,{width:image.width,height:image.height});
  };
  const stagePortrait = bytes => {
    const image = normalizePortrait(bytes);
    return { bytes: new Uint8Array(image.data), dataUrl: `data:image/png;base64,${image.data.toString('base64')}`, width: image.width, height: image.height };
  };
  ipcMain.handle("library:portrait", (_event,id) => library.getPortrait(id));
  handleMutation("library:portrait-set", (_event,id,bytes) => setPortrait(id,bytes));
  handleMutation("library:portrait-choose", async (_event,id) => {
    if (id !== undefined && !await library.get(id)) throw new Error("Bibliothekseintrag nicht gefunden.");
    const choice=await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? undefined, {
      title:ui("Porträtbild auswählen", "Choose portrait image"),properties:["openFile"],filters:[{name:ui("Bilder", "Images"),extensions:["png","jpg","jpeg","webp"]}]
    });
    if (choice.canceled || !choice.filePaths.length) return null;
    const file=choice.filePaths[0];
    if ((await fs.stat(file)).size>12*1024*1024) throw new Error("Bitte ein Bild mit höchstens 12 MB auswählen.");
    const bytes = await fs.readFile(file);
    return id === undefined ? stagePortrait(bytes) : setPortrait(id, bytes);
  });
  handleMutation("library:portrait-paste", async (_event,id) => {
    const image=clipboard.readImage();
    if (image.isEmpty()) throw new Error("Die Zwischenablage enthält kein Bild.");
    return id === undefined ? stagePortrait(image.toPNG()) : setPortrait(id,image.toPNG());
  });
  async function libraryAction(action, payload) {
    const entry = await library.get(payload?.id);
    if (!entry) throw new Error("Dieser Bibliothekseintrag wurde nicht gefunden.");
    if (entry.format === "original") throw new Error(ui("Dieses Original ist ungeprüft. Zuerst in eine geprüfte Arbeitsfassung umwandeln.", "This original is unverified. Create a validated working version first."));
    const relevant = Object.fromEntries(['name','dna','format','profile','schemaInfo'].map(key => [key, entry[key]]));
    return runPythonBridge({action, entry: relevant, expectedTarget: payload?.expectedTarget});
  }
  ipcMain.handle("library:check", (_event, payload) => libraryAction("library_check", payload));
  ipcMain.handle("library:apply", (_event, payload) => libraryAction("library_apply", payload));

  ipcMain.handle("converter:analyze", async (_event, payload) => {
    return runPythonBridge({ ...payload, action: "convert" });
  });

  ipcMain.handle("converter:schemas", () => runPythonBridge({ action: "schemas" }));
  for (const action of ['detect', 'catalog', 'encode', 'palette']) {
    ipcMain.handle(`studio:${action}`, (_event, payload) => runPythonBridge(studioPayload(`studio_${action}`, payload)));
  }
  ipcMain.handle("game:status", () => runPythonBridge({ action: "game_status" }));
  ipcMain.handle("game:read", () => runPythonBridge({ action: "game_copy" }));
  ipcMain.handle("game:copy", async () => {
    const result = await runPythonBridge({ action: "game_copy" });
    if (!result.dna) throw new Error(result.message || "DNA konnte nicht gelesen werden.");
    clipboard.writeText(result.dna);
    const { dna, ...status } = result;
    return status;
  });
  ipcMain.handle("game:paste", (_event, expectedTarget) => runPythonBridge({
    action: "game_paste", dna: clipboard.readText(), expectedTarget
  }));

  ipcMain.handle("clipboard:write-text", async (_event, value) => {
    if (typeof value !== 'string' || value.length > LIMITS.dna) throw new Error('Invalid clipboard text.');
    clipboard.writeText(value);
    return true;
  });
  ipcMain.handle("clipboard:read-text", () => {
    const text = clipboard.readText();
    if (text.length > LIMITS.dna) throw new Error('Clipboard text is too large.');
    return text;
  });

  ipcMain.handle("dialog:load-input-file", async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = await dialog.showOpenDialog(focusedWindow, {
      title: ui("DNA-Eingabe laden", "Load DNA input"),
      properties: ["openFile"],
      filters: [
        { name: ui("DNA-Text", "DNA text"), extensions: ["txt", "dna", "b64"] },
        { name: ui("Alle Dateien", "All files"), extensions: ["*"] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    if ((await fs.stat(filePath)).size > LIMITS.dna * 4) throw new Error('DNA input file is too large.');
    const text = await fs.readFile(filePath, "utf8");
    if (text.length > LIMITS.dna) throw new Error('DNA input file is too large.');
    return { filePath, text };
  });

  handleMutation("dialog:save-output-file", async (_event, payload) => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined;
    const suggestedName =
      payload?.suggestedName && typeof payload.suggestedName === "string"
        ? payload.suggestedName
        : "converted_output.txt";
    const text = payload?.text ?? "";
    if (typeof text !== 'string' || text.length > LIMITS.dna) throw new Error('DNA output is too large.');

    const result = await dialog.showSaveDialog(focusedWindow, {
      title: ui("Konvertierte Ausgabe speichern", "Save converted output"),
      defaultPath: suggestedName,
      filters: [
        { name: ui("Textdateien", "Text files"), extensions: ["txt"] },
        { name: ui("Alle Dateien", "All files"), extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await writeExport(result.filePath, text);
    return { filePath: result.filePath };
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});
app.on("before-quit", event => {
  if (shutdownStarted) return;
  event.preventDefault();
  shutdownStarted = true;
  Promise.allSettled([stopPythonBridge(), ...activeMutations]).then(async () => {
    await Promise.allSettled([library?.close(), languageSettings?.queue, pathSettings?.queue]);
  }).finally(() => app.quit());
});
