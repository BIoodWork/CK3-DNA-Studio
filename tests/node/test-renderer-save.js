const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/app.js'), 'utf8');
// Exercise the actual save functions without starting Electron or a DOM.
const saveSource = source.slice(source.indexOf('function payloadFromWork('), source.indexOf('function dataUrlBytes('));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function work() {
  return { name: 'Before', note: '', sex: 'female', favorite: true, ready: true, format: 'encoded', profile: 'none', originalProfile: 'none',
    original: 'exact original', output: 'AAECAw==', schemaInfo: {}, lossReport: [], genes: [{ name: 'gene', values: [1, 2, 3, 4] }],
    portrait: { bytes: new Uint8Array([1, 2, 3]), dataUrl: 'data:image/png;base64,AQID' }, dirty: true, savedId: 'previous', encoding: false, encodeError: '' };
}
function setup(api) {
  const state = { work: work(), codeDraft: null, page: 'edit' };
  const context = { state, api, clone: structuredClone, t: key => key, refreshLibrary: async () => {}, toast() {}, renderEditor() {}, dataUrlBytes: () => { throw new Error('Unexpected data URL path'); } };
  vm.runInNewContext(saveSource, context);
  return { state, save: context.saveWorking };
}

test('saving detaches DNA and portrait snapshots and never clears newer edits', async () => {
  const pending = deferred();
  let savedPayload, savedPortrait;
  const { state, save } = setup({ librarySave: payload => { savedPayload = payload; return pending.promise; }, libraryPortraitSet: async (_id, bytes) => { savedPortrait = bytes; } });
  const operation = save();
  state.work.name = 'Edited during save';
  state.work.portrait.bytes[0] = 99;
  state.work.portrait.dataUrl = 'data:image/png;base64,YwID';
  state.work.genes[0].values[0] = 10;
  pending.resolve({ id: 'saved-snapshot' });
  await operation;
  assert.equal(savedPayload.name, 'Before');
  assert.deepEqual([...savedPortrait], [1, 2, 3]);
  assert.equal(state.work.dirty, true);
  assert.equal(state.work.savedId, 'previous', 'newer work must not be attached to the older snapshot');
});

test('save completion waits for portrait persistence and portrait failure retains unsaved state', async () => {
  const pending = deferred();
  const stable = setup({ librarySave: async () => ({ id: 'complete' }), libraryPortraitSet: () => pending.promise });
  const operation = stable.save();
  await Promise.resolve();
  assert.equal(stable.state.work.dirty, true);
  assert.equal(stable.state.work.savedId, 'previous');
  pending.resolve();
  await operation;
  assert.equal(stable.state.work.dirty, false);
  assert.equal(stable.state.work.savedId, 'complete');
  const failed = setup({ librarySave: async () => ({ id: 'incomplete' }), libraryPortraitSet: async () => { throw new Error('Disk unavailable'); } });
  await assert.rejects(failed.save(), /Disk unavailable/);
  assert.equal(failed.state.work.dirty, true);
  assert.equal(failed.state.work.savedId, 'previous');
});

test('replacing the open workspace during a save cannot mark either workspace complete', async () => {
  const pending = deferred();
  const { state, save } = setup({ librarySave: () => pending.promise, libraryPortraitSet: async () => {} });
  const previous = state.work;
  const operation = save();
  state.work = { ...work(), name: 'Replacement' };
  pending.resolve({ id: 'old-workspace' });
  await operation;
  assert.equal(previous.dirty, true);
  assert.equal(state.work.dirty, true);
  assert.equal(state.work.name, 'Replacement');
  assert.equal(state.work.savedId, 'previous');
});

test('async actions lock edit surfaces, keep confirmations available and restore prior disabled states after failure', async () => {
  const surface = { id: 'app', inert: false }, alreadyInert = { id: 'previously-inert', inert: true }, confirm = { id: 'confirmDialog', inert: false }, toast = { id: 'toast', inert: false };
  const enabledField = { disabled: false, isConnected: true }, disabledField = { disabled: true, isConnected: true };
  const context = {
    state: { busy: false }, toast() {},
    document: { body: { children: [surface, alreadyInert, confirm, toast], classList: { add() {}, remove() {} } }, querySelectorAll: () => [enabledField, disabledField] }
  };
  vm.runInNewContext(source.slice(source.indexOf('async function run('), source.indexOf('function renderChrome(')), context);
  await context.run(async () => {
    assert.equal(surface.inert, true);
    assert.equal(confirm.inert, false);
    assert.equal(enabledField.disabled, true);
    throw new Error('Interrupted action');
  });
  assert.equal(context.state.busy, false);
  assert.equal(surface.inert, false);
  assert.equal(alreadyInert.inert, true);
  assert.equal(enabledField.disabled, false);
  assert.equal(disabledField.disabled, true);
});
