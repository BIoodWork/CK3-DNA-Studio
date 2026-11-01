const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

async function setup(env = {}) {
  const handlers = new Map(), calls = [], state = { writes: 0, portraitSets: 0, choiceCanceled: true };
  let ready;
  const app = new EventEmitter();
  Object.assign(app, {
    setName(name) { state.name = name; },
    setPath(kind, value) { assert.equal(kind, 'userData'); state.profile = value; },
    getPath(kind) { return kind === 'appData' ? 'C:/AppData' : state.profile; },
    requestSingleInstanceLock() { state.identityAtLock = { name: state.name, profile: state.profile }; return true; },
    whenReady() { return { then(callback) { ready = callback; } }; },
    setAppUserModelId(id) { state.appId = id; }, getVersion() { return '1.0'; }
  });
  class Window {
    constructor(options) { state.window = options; this.webContents = { setWindowOpenHandler() {}, on() {} }; }
    loadFile() {} once() {}
    static getFocusedWindow() { return undefined; }
    static getAllWindows() { return []; }
  }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
  const image = { isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }), toPNG: () => png };
  const electron = {
    app, BrowserWindow: Window, ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } }, Menu: { setApplicationMenu() {} },
    clipboard: { readImage: () => image, readText: () => 'clipDNA', writeText() { state.writes++; } },
    nativeImage: { createFromPath: () => image, createFromBuffer: () => image },
    dialog: { showSaveDialog: async () => ({ canceled: true }), showOpenDialog: async () => ({ canceled: state.choiceCanceled, filePaths: ['portrait.png'] }) }
  };
  class Settings { constructor() { this.paths = { game: '', epe: '', agot: '' }; this.language = 'en'; } async load() {} }
  class Library {
    constructor() {} async exportBundle(id) { state.exportId = id; return { entries: [{ name: 'Test' }] }; }
    async get() { return state.entry || { format: 'encoded' }; }
    async setPortrait() { state.portraitSets++; return { stored: true }; }
  }
  const context = {
    require(name) {
      if (name === 'electron') return electron;
      if (name === './python-bridge') return { runPythonBridge: async payload => { calls.push(payload); return { dna: 'AAECAw==', characterName: 'Read only' }; } };
      if (name === './language-settings') return { LanguageSettings: Settings };
      if (name === './path-settings') return { PathSettings: Settings };
      if (name === './library-store') return { LibraryStore: Library, LIMITS: { dna: 1900000 } };
      if (name === './studio-input') return require('../../src/main/studio-input');
      if (name === './manager-import') return require('../../src/main/manager-import');
      if (name === 'fs/promises') return { stat: async () => ({ size: png.length }), readFile: async () => png };
      return require(name);
    },
    process: { platform: 'win32', env }, __dirname: path.resolve(__dirname, '../../src/main'), Buffer, Uint8Array, Promise, Set, Object, Error
  };
  vm.runInNewContext(fs.readFileSync(path.join(context.__dirname, 'main.js'), 'utf8'), context);
  await ready();
  return { state, calls, invoke: (channel, ...args) => handlers.get(channel)(null, ...args) };
}

test('Studio identity/profile precede instance lock and renderer runs sandboxed', async () => {
  const { state } = await setup();
  assert.equal(state.identityAtLock.name, 'Crusader Kings III DNA Studio');
  assert.equal(state.identityAtLock.profile, path.join('C:/AppData', 'ck3-dna-studio'));
  assert.equal(state.appId, 'com.ck3dnastudio.desktop');
  assert.equal(state.window.webPreferences.sandbox, true);
  const isolated = await setup({ CK3_STUDIO_TEST_USER_DATA: 'C:/IsolatedTest' });
  assert.equal(isolated.state.identityAtLock.profile, 'C:/IsolatedTest');
});

test('live DNA read and staged portraits leave clipboard/library untouched until explicit save', async () => {
  const { state, invoke, calls } = await setup();
  assert.equal((await invoke('game:read')).dna, 'AAECAw==');
  assert.equal(calls[0].action, 'game_copy');
  assert.equal(state.writes, 0);
  const pasted = await invoke('library:portrait-paste');
  assert.equal(pasted.width, 1);
  assert.match(pasted.dataUrl, /^data:image\/png;base64,/);
  assert.ok(pasted.bytes instanceof Uint8Array);
  state.choiceCanceled = false;
  assert.equal((await invoke('library:portrait-choose')).dataUrl, pasted.dataUrl);
  assert.equal(state.portraitSets, 0);
  await invoke('library:portrait-set', 'entry-id', pasted.bytes);
  assert.equal(state.portraitSets, 1);
  state.entry = { format: 'original' };
  await assert.rejects(invoke('library:apply', { id: 'archived' }), /unverified/);
  assert.equal(calls.length, 1, 'unverified originals cannot reach the write bridge');
});

test('single-entry export forwards only selected identity and Studio detection uses whitelist', async () => {
  const { state, invoke, calls } = await setup();
  await invoke('library:export-entry', 'selected');
  assert.equal(state.exportId, 'selected');
  await invoke('studio:detect', { text: 'AAECAw==', profile: 'auto', action: 'game_paste', dna: 'hidden' });
  assert.deepEqual(calls, [{ action: 'studio_detect', text: 'AAECAw==', profile: 'auto' }]);
});
