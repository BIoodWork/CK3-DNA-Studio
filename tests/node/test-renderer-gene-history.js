const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/app.js'), 'utf8');
function setup() {
  const handlers = new Map();
  const state = { work: {
    genes: [{ name: 'gene_test', values: ['first', 2, 'second', 4], editable: true }], baseline: { gene_test: ['first', 2, 'second', 4] },
    ready: true, source: 'original text', output: 'working text', format: 'ruler_designer', profile: 'none', schemaInfo: {}, lossReport: [], dirty: false, undo: [], redo: []
  }, codeDraft: null, conversion: null };
  const context = {
    state, geneEditSession: null, clone: structuredClone, encodeTimer: null, encodeRevision: 0,
    clearTimeout() {}, scheduleEncode() {}, renderEditor() {}, refreshWorkingSwatches() {}, updateEditorActions() {},
    $: () => ({ textContent: '' }), t: () => '', changedGenes: () => 1,
    document: { querySelectorAll: () => [], addEventListener: (kind, callback) => handlers.set(kind, callback) }
  };
  vm.runInNewContext(source.slice(source.indexOf('function workSnapshot('), source.indexOf('function updateEditorActions(')), context);
  vm.runInNewContext(source.slice(source.indexOf("document.addEventListener('focusout'"), source.indexOf('async function initialize(')), context);
  const node = (type, index = '1') => ({
    type, tagName: type === 'select' ? 'SELECT' : 'INPUT', dataset: { gene: 'gene_test', index }, value: '2',
    setAttribute() {}, removeAttribute() {}, closest: () => null, matches: () => type === 'range'
  });
  return { state, context, node, dispatch: (kind, target) => handlers.get(kind)?.({ target }) };
}

test('number typing keeps one pre-edit snapshot and a new focused edit creates another undo step', () => {
  const { state, context, node, dispatch } = setup();
  const number = node('number');
  for (const value of ['10', '110', '111']) { number.value = value; context.updateGene(number); }
  assert.equal(state.work.undo.length, 1);
  assert.equal(state.work.undo[0].genes[0].values[1], 2);
  dispatch('focusout', number);
  for (const value of ['112', '113']) { number.value = value; context.updateGene(number); }
  assert.equal(state.work.undo.length, 2);
  context.undo();
  assert.equal(state.work.genes[0].values[1], 111);
  context.undo();
  assert.equal(state.work.genes[0].values[1], 2);
  context.undo(true);
  assert.equal(state.work.genes[0].values[1], 111);
  context.undo(true);
  assert.equal(state.work.genes[0].values[1], 113);
});

test('separate slider drags produce separate undo steps even while the slider retains focus', () => {
  const { state, context, node, dispatch } = setup();
  const range = node('range');
  dispatch('pointerdown', range);
  for (const value of ['12', '20', '31']) { range.value = value; context.updateGene(range); }
  dispatch('pointerup', range);
  dispatch('pointerdown', range);
  for (const value of ['45', '60']) { range.value = value; context.updateGene(range); }
  dispatch('pointerup', range);
  assert.equal(state.work.undo.length, 2);
  context.undo();
  assert.equal(state.work.genes[0].values[1], 31);
  context.undo();
  assert.equal(state.work.genes[0].values[1], 2);
});

test('invalid strengths and readonly genes never create history or modify DNA', () => {
  const { state, context, node } = setup();
  const number = node('number');
  for (const value of ['-1', '256', '1.5', 'NaN']) { number.value = value; context.updateGene(number); }
  assert.equal(state.work.undo.length, 0);
  assert.equal(state.work.genes[0].values[1], 2);
  state.work.genes[0].editable = false;
  number.value = '10';
  context.updateGene(number);
  assert.equal(state.work.undo.length, 0);
  assert.equal(state.work.genes[0].values[1], 2);
});

test('each template selection has its own undo step without requiring focus to leave the selector', () => {
  const { state, context, node } = setup();
  const select = node('select', '0');
  select.value = 'third'; context.updateGene(select);
  select.value = 'fourth'; context.updateGene(select);
  assert.equal(state.work.undo.length, 2);
  context.undo();
  assert.equal(state.work.genes[0].values[0], 'third');
  context.undo();
  assert.equal(state.work.genes[0].values[0], 'first');
});
