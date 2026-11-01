const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { LibraryStore } = require('../../src/main/library-store');
async function fixture(t) {
  const parent = path.join(__dirname, 'tests');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'studio-library-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new LibraryStore(path.join(directory, 'library.json'));
}
const original = overrides => ({ name: 'Unverified original', dna: '\r\n unknown_envelope = { exact = "👑" }\t\n', format: 'original', verification: 'unverified', profile: 'unknown', sourceProfile: 'unknown', ...overrides });

test('unverified originals archive exact bytes and survive single-entry bundle round trip', async t => {
  const store = await fixture(t);
  const entry = await store.save(original());
  const working = await store.save({ name: 'Working version', dna: 'AAECAw==', originalDna: entry.dna, format: 'encoded', profile: 'none', sourceProfile: 'none', verification: 'validated' });
  assert.equal(entry.originalDna, entry.dna);
  assert.equal(entry.schemaInfo, null);
  assert.equal(working.originalDna, entry.dna);
  const bundle = await store.exportBundle(entry.id);
  assert.equal(bundle.entries.length, 1);
  assert.equal(bundle.entries[0].dna, entry.dna);
  assert.equal(bundle.entries[0].verification, 'unverified');
  const target = await fixture(t);
  const imported = await target.importBundle(bundle);
  const copy = await target.get(imported.firstId);
  assert.notEqual(copy.id, entry.id);
  assert.equal(copy.dna, entry.dna);
  assert.equal(copy.originalDna, entry.originalDna);
  assert.equal(copy.verification, entry.verification);
  await assert.rejects(store.exportBundle('11111111-1111-4111-8111-111111111111'), { code: 'LIBRARY_NOT_FOUND' });
});

test('unverified archives cannot masquerade as validated DNA or carry conflicting original metadata', async t => {
  const store = await fixture(t);
  for (const patch of [
    { verification: undefined }, { verification: 'validated' }, { profile: 'none' }, { sourceProfile: 'epe' },
    { schemaInfo: { fingerprint: 'claim' } }, { originalDna: 'different' }, { lossReport: ['claim'] },
    { format: 'encoded' }, { dna: '' }, { dna: 'bad\0data' }
  ]) await assert.rejects(store.save(original(patch)), { code: 'LIBRARY_INVALID_INPUT' });
  assert.deepEqual(await store.list(), []);
  await assert.rejects(store.save({ name: 'Bad working DNA', dna: 'arbitrary text', format: 'encoded', profile: 'none', sourceProfile: 'none', verification: 'unverified' }), { code: 'LIBRARY_INVALID_INPUT' });
});
