const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/app.js'), 'utf8');
function lineOf(name) {
  const line = source.split(/\r?\n/).find(line => line.startsWith(`function ${name}(`) || line.startsWith(`async function ${name}(`));
  assert.ok(line, `Expected actual renderer function ${name}`);
  return line;
}
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function setup() {
  const preparedSelect = { selectedIndex: 1, value: 'saved-id', nativePopupOpen: true };
  Object.defineProperty(preparedSelect, 'innerHTML', { set() { throw new Error('Native selector was replaced'); } });
  const nodes = Object.fromEntries(['compatibilityText', 'gameCompatibilityDetails', 'gameCompatibilityReport', 'gameMessage'].map(id => [id, {}]));
  let characterReplacements = 0, checks = 0;
  nodes.gameCharacterPanel = {};
  Object.defineProperty(nodes.gameCharacterPanel, 'innerHTML', { set() { characterReplacements++; } });
  nodes.preparedSelect = preparedSelect;
  nodes.main = {};
  Object.defineProperty(nodes.main, 'innerHTML', { set() { throw new Error('Connection screen was replaced'); } });
  const buttons = { '[data-action="apply-prepared"]': { disabled: false }, '[data-action="apply-clipboard"]': { disabled: false } };
  const game = { ready: true, pid: 1, id: 2, selectionToken: 'old', name: 'Character', geneCount: 128, gameVersion: '1.20' };
  const state = { page: 'connection', game, gameBusy: false, prepared: 'saved-id', compatibility: { compatible: true }, compatKey: 'saved-id:1:2:old', gameMessage: '' };
  const context = {
    state, pollInFlight: false, pollTimer: null, compatRevision: 0,
    api: { gameStatus: async () => ({ ...game }), libraryCheck: async () => { checks++; return { compatible: true }; } },
    document: { activeElement: preparedSelect, querySelector: selector => buttons[selector] },
    $: id => nodes[id], t: value => value, gameCharacterMarkup: () => '<span>updated character</span>',
    clearTimeout() {}, setTimeout: () => 1
  };
  vm.runInNewContext(['targetKey', 'expectedTarget', 'canApply', 'gameStatusSignature', 'syncCompatibility', 'syncConnectionStatus', 'pollGame', 'checkCompatibility'].map(lineOf).join('\n'), context);
  return { context, state, nodes, preparedSelect, buttons, replacements: () => characterReplacements, checks: () => checks };
}

test('unchanged polls preserve the native DNA selector, focus and compatibility without rendering', async () => {
  const env = setup();
  const compatible = env.state.compatibility;
  await env.context.pollGame();
  await env.context.pollGame();
  assert.equal(env.replacements(), 0);
  assert.equal(env.state.compatibility, compatible);
  assert.equal(env.context.document.activeElement, env.preparedSelect);
  assert.equal(env.preparedSelect.nativePopupOpen, true);
  assert.equal(env.preparedSelect.value, 'saved-id');
  assert.equal(env.checks(), 0);
});

test('changed target refreshes character and compatibility while preserving an open native selector', async () => {
  const env = setup();
  const pending = deferred();
  env.context.api.libraryCheck = () => pending.promise;
  env.context.api.gameStatus = async () => ({ ...env.state.game, id: 3, selectionToken: 'new', name: 'Next character' });
  await env.context.pollGame();
  assert.equal(env.replacements(), 1);
  assert.equal(env.buttons['[data-action="apply-prepared"]'].disabled, true, 'old compatibility must stop authorizing a changed target');
  assert.equal(env.preparedSelect.nativePopupOpen, true);
  assert.equal(env.context.document.activeElement, env.preparedSelect);
  pending.resolve({ compatible: true, details: { checked: true } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(env.state.compatKey, 'saved-id:1:3:new');
  assert.equal(env.buttons['[data-action="apply-prepared"]'].disabled, false);
  assert.equal(env.nodes.gameCompatibilityReport.textContent.includes('checked'), true);
});

test('late compatibility for a previous selection cannot enable applying the new selection', async () => {
  const env = setup();
  const pending = deferred();
  env.context.api.libraryCheck = () => pending.promise;
  const operation = env.context.checkCompatibility();
  env.state.prepared = 'different-entry';
  pending.resolve({ compatible: true });
  await operation;
  assert.equal(env.state.compatibility, null);
  assert.equal(env.buttons['[data-action="apply-prepared"]'].disabled, true);
  assert.equal(env.preparedSelect.nativePopupOpen, true);
});
