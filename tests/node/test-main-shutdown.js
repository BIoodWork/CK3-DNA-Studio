"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const source = path.resolve(__dirname, "../..");

async function child(profile, entryId) {
  const { EventEmitter } = require("node:events");
  const Module = require("node:module");
  const app = new EventEmitter();
  const libraryFile = path.join(profile, "dna-library.json");
  const handlers = new Map();
  let ready, busyInjected = false, mutationSettled = false, lateMutationRejected = false;
  let stopRequested = false, quitCalls = 0;
  // A broken shutdown must fail the child instead of exiting accidentally when
  // it has no pending I/O. The parent also enforces an independent time limit.
  setTimeout(() => { throw new Error("The main process did not finish shutdown."); }, 8000);
  Object.assign(app, {
    isPackaged: false,
    requestSingleInstanceLock: () => true,
    whenReady: () => ({ then: callback => { ready = callback; } }),
    setName() {}, setAppUserModelId() {},
    setPath(kind, value) { assert.equal(kind, "userData"); assert.equal(value, profile); },
    getPath(kind) { assert.equal(kind, "userData"); return profile; },
    getVersion: () => "0.5.0-test",
    quit() {
      quitCalls++;
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      app.emit("before-quit", event);
      if (!event.prevented) {
        assert.equal(quitCalls, 2, "shutdown must prevent the initial quit and retry after draining");
        assert.equal(busyInjected, true);
        assert.equal(stopRequested, true);
        assert.equal(lateMutationRejected, true);
        assert.equal(mutationSettled, true, "accepted mutation must settle before final quit");
        const document = JSON.parse(fs.readFileSync(libraryFile, "utf8"));
        assert.equal(document.entries.length, 1, "late saves must never enter the library");
        assert.equal(document.entries[0].id, entryId);
        assert.equal(document.entries[0].favorite, true, "favorite must be committed before final quit");
        process.stdout.write("MAIN_SHUTDOWN_DRAIN_VERIFIED\n");
        process.exit(0);
      }
    }
  });
  class Window {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    loadFile() {} once() {}
    static getAllWindows() { return []; }
  }
  const electron = {
    app, BrowserWindow: Window, Menu: { setApplicationMenu() {}, buildFromTemplate: template => template },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === "electron") return electron;
    if (request === "./python-bridge") return {
      runPythonBridge: async () => ({}),
      stopPythonBridge: async () => { stopRequested = true; },
      restartPythonBridge: async () => {}
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  require(path.join(source, "src/main/main.js"));
  await ready();
  const originalRename = fs.renameSync;
  const originalAsyncRename = fsp.rename;
  function interruptOnce(destination) {
    if (destination !== libraryFile || busyInjected) return;
    busyInjected = true;
    setImmediate(() => {
      assert.equal(JSON.parse(fs.readFileSync(libraryFile, "utf8")).entries[0].favorite, false);
      app.quit();
      assert.equal(quitCalls, 1, "the initial quit must wait for the blocked library replacement");
      assert.throws(() => handlers.get("library:update")(null, entryId, { favorite: false }), /closing|beendet/i);
      assert.throws(() => handlers.get("library:save")(null, {
        name: "Must not be accepted", dna: "AAECAw==", format: "encoded", profile: "none", sourceProfile: "none"
      }), /closing|beendet/i);
      lateMutationRejected = true;
    });
    throw Object.assign(new Error("Simulated temporary read/antivirus lock"), { code: "EBUSY" });
  }
  fs.renameSync = function(from, to) { interruptOnce(to); return originalRename.call(this, from, to); };
  fsp.rename = async function(from, to) { interruptOnce(to); return originalAsyncRename.call(this, from, to); };
  await handlers.get("library:update")(null, entryId, { favorite: true }).then(() => { mutationSettled = true; });
}

if (process.argv[2] === "child") {
  child(process.argv[3], process.argv[4]).catch(error => { console.error(error); process.exit(1); });
} else {
  const test = require("node:test");
  const { LibraryStore } = require("../../src/main/library-store");
  test("main quit drains a library commit through a temporary file lock and rejects new mutations", async t => {
    const temporaryRoot = path.join(__dirname, "tests");
    await fsp.mkdir(temporaryRoot, { recursive: true });
    const profile = await fsp.mkdtemp(path.join(temporaryRoot, "main-shutdown-"));
    t.after(async () => {
      assert.equal(path.dirname(profile), temporaryRoot);
      await fsp.rm(profile, { recursive: true, force: true });
    });
    const store = new LibraryStore(path.join(profile, "dna-library.json"));
    const entry = await store.save({ name: "Isolated shutdown fixture", dna: "AAECAw==", format: "encoded", profile: "none", sourceProfile: "none" });
    await store.close();
    const result = spawnSync(process.execPath, [__filename, "child", profile, entry.id], {
      encoding: "utf8", timeout: 12000, windowsHide: true,
      env: { ...process.env, CK3_CONVERTER_TEST_USER_DATA: profile }
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /MAIN_SHUTDOWN_DRAIN_VERIFIED/);
    const persisted = await new LibraryStore(path.join(profile, "dna-library.json")).get(entry.id);
    assert.equal(persisted.favorite, true);
    assert.equal(persisted.dna, entry.dna);
    assert.deepEqual(await fsp.readdir(profile), ["dna-library.json"]);
  });
}
