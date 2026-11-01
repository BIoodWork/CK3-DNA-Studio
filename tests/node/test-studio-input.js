const test = require('node:test');
const assert = require('node:assert/strict');
const { studioPayload } = require('../../src/main/studio-input');

test('Studio IPC forwards only bounded documented fields and cannot change backend actions', () => {
  assert.deepEqual(studioPayload('studio_detect', { text: ' dna = "AAECAw=="\r\n', profile: 'auto', action: 'game_paste', deadline: 9 }), {
    action: 'studio_detect', text: ' dna = "AAECAw=="\r\n', profile: 'auto'
  });
  assert.deepEqual(studioPayload('studio_catalog', { profile: 'epe', text: 'ignored', path: 'C:/private' }), { action: 'studio_catalog', profile: 'epe' });
  const input = { text: 'AAECAw==', profile: 'none', targetFormat: 'encoded', genes: [{ name: 'gene_test', values: [1, 2, 3, 4], options: Array(10).fill('ignored'), editable: true }] };
  const payload = studioPayload('studio_encode', input);
  assert.deepEqual(payload.genes, [{ name: 'gene_test', values: [1, 2, 3, 4] }]);
  input.genes[0].values[0] = 99;
  assert.equal(payload.genes[0].values[0], 1, 'caller mutations cannot change accepted payload');
  assert.deepEqual(studioPayload('studio_encode', { text: 'genes = {}', profile: 'agot', genes: [{ name: 'gene', values: ['template', 0.5, 'other', 0] }] }).genes[0].values, ['template', 0.5, 'other', 0]);
  assert.deepEqual(studioPayload('studio_encode', { text: 'genes = {}', profile: 'agot', genes: [{ name: 'opaque_gene', values: null }] }).genes, [{ name: 'opaque_gene', values: null }]);
});

test('Studio IPC rejects oversize and malformed edits before backend dispatch', () => {
  for (const value of [null, [], { text: '' }, { text: 'a'.repeat(1900001) }, { text: 'a\0b' }, { text: 'dna', profile: 'unknown' }]) {
    assert.throws(() => studioPayload('studio_detect', value), /Invalid Studio input/);
  }
  for (const change of [
    { profile: 'auto' }, { genes: new Array(10001) }, { genes: [{ name: 'x', values: [1] }] },
    { genes: [{ name: 'x', values: [NaN, 0, 0, 0] }] }, { genes: [{ name: 'x', values: [{}, 0, 0, 0] }] },
    { genes: [{ name: 'x'.repeat(201), values: [0, 0, 0, 0] }] }, { targetFormat: 'original' }
  ]) assert.throws(() => studioPayload('studio_encode', { text: 'AAECAw==', profile: 'none', genes: [], ...change }), /Invalid Studio input/);
});
