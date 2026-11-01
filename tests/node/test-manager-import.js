const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { LibraryStore } = require('../../src/main/library-store');
const { managerToBundle, MANAGER_FORMAT } = require('../../src/main/manager-import');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const source = overrides => ({ name: 'Älva 👑', notes: 'Exact\r\nnotes', favorite: true, base64: 'AAECAw==', ...overrides });
const exportOf = entries => ({ format: MANAGER_FORMAT, entries });
const normalizePortrait = bytes => { assert.deepEqual(bytes, png); return { data: png, width: 1, height: 1 }; };
async function fixture(t) {
  const parent = path.join(__dirname, 'tests');
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'manager-import-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { store: new LibraryStore(path.join(directory, 'library.json')), file: path.join(directory, 'library.json') };
}

test('documented Manager export prefers exact named DNA and retains metadata, favorites, notes and normalized portrait', async t => {
  const rulerDesigner = '\r\n ruler_designer_7 = { genes = { unknown_future = { opaque=yes } } }\t\n';
  const rulerMeta = { name: 'Original character', age: 30, override: { retained: true } };
  const inputs = [];
  const converted = await managerToBundle(exportOf([source({ rulerDesigner, rulerMeta, portraitPng: png.toString('base64'), createdAt: 'old-timestamp' })]), {
    detect: async text => { inputs.push(text); return { status: 'unsupported' }; }, normalizePortrait
  });
  assert.deepEqual(inputs, [rulerDesigner], 'must never infer legacy slots from alternate Base64');
  assert.equal(converted.archivedCount, 1);
  assert.equal(converted.bundle.entries[0].thumbnail.sha256, createHash('sha256').update(png).digest('hex'));
  const { store } = await fixture(t);
  const result = await store.importBundle(converted.bundle);
  const saved = await store.get(result.firstId);
  assert.equal(saved.dna, rulerDesigner);
  assert.equal(saved.originalDna, rulerDesigner);
  assert.equal(saved.format, 'original');
  assert.equal(saved.profile, 'unknown');
  assert.equal(saved.verification, 'unverified');
  assert.equal(saved.name, 'Älva 👑');
  assert.equal(saved.note, 'Exact\r\nnotes');
  assert.equal(saved.favorite, true);
  assert.deepEqual(saved.importMetadata, { format: MANAGER_FORMAT, base64: 'AAECAw==', rulerMeta, createdAt: 'old-timestamp' });
  assert.equal((await store.getPortrait(saved.id)).dataUrl, `data:image/png;base64,${png.toString('base64')}`);
  const roundtrip = await store.exportBundle(saved.id);
  assert.deepEqual(roundtrip.entries[0].importMetadata, saved.importMetadata);
});

test('Manager Base64 becomes working DNA only after a uniquely recognized complete installed schema', async t => {
  const recognized = { status: 'ready', profile: 'none', format: 'encoded', normalized: 'AAECAw==', encoded: 'AAECAw==', schemaInfo: { source: { fingerprint: 'actual' }, target: { fingerprint: 'actual' } } };
  const { bundle, archivedCount } = await managerToBundle(exportOf([source(), source({ name: 'Shared schema' }), source({ name: 'Future named keys', rulerDesigner: 'genes = { future = {} }' })]), {
    detect: async text => text.includes('future') ? { ...recognized, format: 'ruler_designer', encoded: null, normalized: text } : recognized,
    normalizePortrait
  });
  assert.equal(archivedCount, 1);
  const { store } = await fixture(t);
  const imported = await store.importBundle(bundle);
  const valid = await store.get(imported.ids[0]);
  assert.equal(valid.verification, 'validated');
  assert.equal(valid.sourceProfile, 'none');
  assert.equal(valid.dna, 'AAECAw==');
  assert.equal((await store.get(imported.ids[2])).verification, 'unverified');
  const ambiguous = await managerToBundle(exportOf([source()]), { detect: async () => ({ status: 'ambiguous', candidates: ['none', 'epe'] }), normalizePortrait });
  assert.equal(ambiguous.bundle.entries[0].format, 'original');
  const unavailable = await managerToBundle(exportOf([source()]), { detect: async () => { throw new Error('Missing schema'); }, normalizePortrait });
  assert.equal(unavailable.bundle.entries[0].dna, source().base64);
});

test('malformed external entries and images reject the whole transaction without changing existing data', async t => {
  const { store, file } = await fixture(t);
  await store.save({ name: 'Existing', dna: 'AAECAw==', format: 'encoded', profile: 'none', sourceProfile: 'none' });
  const before = await fs.readFile(file, 'utf8');
  const options = { detect: async () => ({ status: 'unsupported' }), normalizePortrait };
  const invalid = [
    { format: 'some-other-manager', entries: [] }, exportOf([source(), source({ base64: '' })]),
    exportOf([source(), source({ portraitPng: '../outside.png' })]), exportOf([source({ portraitPng: Buffer.from('not PNG').toString('base64') })]),
    exportOf([source(), source({ name: 1 })]), exportOf([source(), source({ notes: {} })]),
    exportOf([source({ rulerMeta: JSON.parse('{"__proto__": {"unsafe":true}}') })])
  ];
  for (const document of invalid) {
    await assert.rejects(async () => { const { bundle } = await managerToBundle(document, options); await store.importBundle(bundle); });
    assert.equal(await fs.readFile(file, 'utf8'), before);
  }
});
