const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { LibraryStore, LIMITS } = require("../../src/main/library-store");

const sample = overrides => ({
  name: "Älva 王", note: "Exact note\nZweite Zeile", dna: "AAECA//+/fw=",
  format: "encoded", profile: "epe", sourceProfile: "none",
  schemaInfo: { source: { fingerprint: "original" } }, lossReport: [], ...overrides
});
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(__dirname, "tests", "library-fields-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "dna-library.json");
  return { file, store: new LibraryStore(file) };
}

test("legacy entries read without rewrites and retain absent fields through unrelated edits", async t => {
  const { file, store } = await fixture(t);
  const entry = await store.save(sample());
  delete entry.originalDna;
  delete entry.sex;
  const legacy = JSON.stringify({ version: 1, entries: [entry] });
  await fs.writeFile(file, legacy);
  const reopened = new LibraryStore(file);
  assert.deepEqual(await reopened.list(), [entry]);
  assert.deepEqual(await reopened.get(entry.id), entry);
  assert.equal(await fs.readFile(file, "utf8"), legacy);

  const edited = await reopened.update(entry.id, { note: "Updated old entry" });
  const pictured = await reopened.setPortrait(entry.id, png, { width: 1, height: 1 });
  const cleared = await reopened.removePortrait(entry.id);
  for (const value of [edited, pictured, cleared, await reopened.get(entry.id)]) {
    assert.equal(Object.hasOwn(value, "originalDna"), false);
    assert.equal(Object.hasOwn(value, "sex"), false);
    assert.equal(value.dna, entry.dna);
    assert.equal(value.sourceProfile, entry.sourceProfile);
  }
  const sexEdit = await reopened.update(entry.id, { sex: "female" });
  assert.equal(sexEdit.sex, "female");
  assert.equal(Object.hasOwn(sexEdit, "originalDna"), false);
});

test("stores exact source input independently from canonical converted DNA and persists sex", async t => {
  const { store, file } = await fixture(t);
  // Source DNA includes wrappers, original line endings, tabs and Unicode.
  const originals = [
    '  dna = "AAECAw=="\r\n',
    '\ncharacter = {\r\n\tname = "Älva 王 👑"\r\n\tdna = "AAECAw=="\r\n}\n',
    "AAEC\nAw==", "x".repeat(LIMITS.dna)
  ];
  for (const [index, originalDna] of originals.entries()) {
    const sex = ["male", "female", "unspecified", "female"][index];
    const saved = await store.save(sample({ originalDna, sex, sourceProfile: "agot" }));
    const persisted = await new LibraryStore(file).get(saved.id);
    assert.equal(saved.originalDna, originalDna);
    assert.equal(persisted.originalDna, originalDna);
    assert.equal(persisted.sex, sex);
    assert.equal(persisted.dna, sample().dna);
    assert.equal(persisted.sourceProfile, "agot");
    assert.equal(JSON.parse(await fs.readFile(file, "utf8")).entries[index].originalDna, originalDna);
  }
  for (const payload of [sample(), sample({ originalDna: null })]) {
    const entry = await store.save(payload);
    assert.equal(entry.originalDna, null);
    assert.equal(entry.sex, "unspecified");
    assert.equal((await new LibraryStore(file).get(entry.id)).originalDna, null);
  }
});

test("invalid new fields and immutable source edits leave the file byte-identical", async t => {
  const { store, file } = await fixture(t);
  const saved = await store.save(sample({ originalDna: 'dna="original"', sex: "male" }));
  const before = await fs.readFile(file, "utf8");
  const invalidOriginals = ["", " \r\n\t", 1, true, {}, [], "a".repeat(LIMITS.dna + 1), "DNA\0bad"];
  const invalidSexes = ["", "Male", "other", null, 1, false, {}, []];
  for (const originalDna of invalidOriginals) {
    await assert.rejects(store.save(sample({ originalDna })), { code: "LIBRARY_INVALID_INPUT" });
    assert.equal(await fs.readFile(file, "utf8"), before);
  }
  for (const sex of invalidSexes) {
    await assert.rejects(store.save(sample({ sex })), { code: "LIBRARY_INVALID_INPUT" });
    await assert.rejects(store.update(saved.id, { name: "Must not apply", sex }), { code: "LIBRARY_INVALID_INPUT" });
    assert.equal(await fs.readFile(file, "utf8"), before);
  }
  for (const originalDna of ["replacement", null, undefined]) {
    await assert.rejects(store.update(saved.id, { note: "Must not apply", originalDna }), { code: "LIBRARY_INVALID_INPUT" });
    assert.equal(await fs.readFile(file, "utf8"), before);
  }
  await assert.rejects(store.update(saved.id, { sex: undefined }), { code: "LIBRARY_INVALID_INPUT" });
  assert.equal(await fs.readFile(file, "utf8"), before);
});

test("corrupt persisted new fields reject reads and mutations without changing bytes", async t => {
  const { store, file } = await fixture(t);
  const entry = await store.save(sample({ originalDna: "source", sex: "female" }));
  for (const invalid of [{ sex: "unknown" }, { sex: null }, { originalDna: "" }, { originalDna: 1 }, { originalDna: "x".repeat(LIMITS.dna + 1) }]) {
    const content = JSON.stringify({ version: 1, entries: [{ ...entry, ...invalid }] });
    await fs.writeFile(file, content);
    for (const action of [() => store.list(), () => store.get(entry.id), () => store.update(entry.id, { sex: "male" }), () => store.save(sample()), () => store.removePortrait(entry.id)]) {
      await assert.rejects(action(), { code: "LIBRARY_CORRUPT" });
      assert.equal(await fs.readFile(file, "utf8"), content);
    }
  }
});

test("sex and photo edits preserve original input, converted DNA and source metadata", async t => {
  const { store, file } = await fixture(t);
  const originalDna = '\r\n source_dna = "AAECAw=="\t\n';
  const original = await store.save(sample({ originalDna, sex: "male", sourceProfile: "agot" }));
  const second = new LibraryStore(file);
  await Promise.all([
    store.update(original.id, { sex: "female", favorite: true }),
    second.setPortrait(original.id, png, { width: 1, height: 1 })
  ]);
  const pictured = await second.get(original.id);
  assert.equal(pictured.sex, "female");
  assert.equal(pictured.favorite, true);
  assert.ok(await second.getPortrait(original.id));
  const cleared = await second.removePortrait(original.id);
  const unspecified = await store.update(original.id, { sex: "unspecified" });
  for (const entry of [pictured, cleared, unspecified, await new LibraryStore(file).get(original.id)]) {
    for (const key of ["originalDna", "dna", "sourceProfile", "profile", "format", "note", "createdAt"]) assert.equal(entry[key], original[key]);
    assert.deepEqual(entry.schemaInfo, original.schemaInfo);
    assert.deepEqual(entry.lossReport, original.lossReport);
  }
  assert.equal(unspecified.sex, "unspecified");
  assert.equal(cleared.thumbnail, null);
});
