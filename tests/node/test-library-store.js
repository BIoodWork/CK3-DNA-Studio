const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { LibraryStore, LIMITS } = require("../../src/main/library-store");

const sample = overrides => ({
  name: "Älva 王 👑",
  note: "Notiz mit Umlauten: Größe\nZweite Zeile.",
  dna: Buffer.from([0, 1, 2, 3, 255, 254, 253, 252]).toString("base64"),
  format: "encoded", profile: "epe", sourceProfile: "none",
  schemaInfo: { source: { version: "1.20.1.2", fingerprint: "source-α" }, target: { version: "2.2.0", fingerprint: "target-β" } },
  lossReport: [{ gene: "gene_test", source: ["one", 0], target: ["two", 1], reason: "Nächstliegende Form" }],
  ...overrides
});

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(__dirname, "tests", "library-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "nested", "dna-library.json");
  return { directory, file, store: new LibraryStore(file) };
}

test("persists approved DNA and metadata exactly, including Unicode, and supports edits/removal", async t => {
  const { store, file } = await fixture(t);
  assert.deepEqual(await store.list(), []);
  await assert.rejects(fs.stat(file), { code: "ENOENT" });
  const payload = sample();
  const saved = await store.save(payload);
  assert.equal(saved.name, payload.name);
  assert.equal(saved.dna, payload.dna);
  assert.equal(saved.note, payload.note);
  assert.equal(saved.favorite, false);
  assert.equal(saved.thumbnail, null);
  assert.ok(saved.id);
  assert.equal(saved.createdAt, saved.updatedAt);
  payload.schemaInfo.source.fingerprint = "mutated input";
  saved.schemaInfo.target.fingerprint = "mutated return";
  const reopened = new LibraryStore(file);
  const persisted = await reopened.get(saved.id);
  assert.equal(persisted.schemaInfo.source.fingerprint, "source-α");
  assert.equal(persisted.schemaInfo.target.fingerprint, "target-β");
  const edited = await reopened.update(saved.id, { name: "  Neu 👑  ", note: "", favorite: true });
  assert.equal(edited.name, "Neu 👑");
  assert.equal(edited.note, "");
  assert.equal(edited.favorite, true);
  assert.equal(edited.dna, persisted.dna);
  assert.equal(edited.createdAt, persisted.createdAt);
  assert.ok(edited.updatedAt >= edited.createdAt);
  assert.equal(await reopened.remove(saved.id), true);
  assert.equal(await reopened.remove(saved.id), false);
  assert.equal(await reopened.get(saved.id), null);
  await assert.rejects(reopened.update(saved.id, { favorite: false }), { code: "LIBRARY_NOT_FOUND" });
  assert.deepEqual(await new LibraryStore(file).list(), []);
});

test("accepts CK3 text with quoted braces/comments without modifying it", async t => {
  const { store } = await fixture(t);
  const dna = 'ruler_designer_0 = {\n name = "A { \\" B"\n # ignored }\n genes = { hair_color = { 1 2 3 4 } }\n}';
  const saved = await store.save(sample({ dna, format: "ruler_designer" }));
  assert.equal((await store.get(saved.id)).dna, dna);
});

test("rejects invalid payloads without touching existing data", async t => {
  const { store, file } = await fixture(t);
  const saved = await store.save(sample());
  const before = await fs.readFile(file, "utf8");
  const circular = {}; circular.self = circular;
  const invalid = [
    null, [], sample({ name: " " }), sample({ name: "a".repeat(LIMITS.name + 1) }),
    sample({ note: "a".repeat(LIMITS.note + 1) }), sample({ favorite: 1 }), sample({ profile: "other" }),
    sample({ sourceProfile: null }), sample({ format: "b64" }), sample({ dna: "" }),
    sample({ dna: "AAECA/==" }), // Decodes, but has noncanonical pad bits.
    sample({ dna: "AAECAw==\n" }), sample({ dna: '"AAECAw=="' }), sample({ dna: "AAECAw" }),
    sample({ dna: "AA==" }), sample({ dna: "AAECAw==\0" }), sample({ dna: "a".repeat(LIMITS.dna + 1) }),
    sample({ dna: "hello", format: "ruler_designer" }), sample({ dna: "genes = {", format: "ruler_designer" }),
    sample({ dna: 'name="genes = { }"', format: "ruler_designer" }), sample({ dna: "genes = {} }", format: "ruler_designer" }),
    sample({ schemaInfo: [] }), sample({ schemaInfo: circular }), sample({ schemaInfo: { count: NaN } }),
    sample({ schemaInfo: { data: "x".repeat(LIMITS.metadata + 1) } }), sample({ lossReport: {} }),
    sample({ thumbnail: "file:///example.png" }), sample({ filePath: "C:/example.json" })
  ];
  for (const payload of invalid) await assert.rejects(store.save(payload));
  for (const patch of [{}, { dna: "AAECAw==" }, { favorite: "true" }, { name: "" }, { note: null }, { thumbnail: null }]) await assert.rejects(store.update(saved.id, patch));
  await assert.rejects(store.get("../file"));
  await assert.rejects(store.remove(null));
  assert.throws(() => new LibraryStore("relative.json"));
  assert.equal(await fs.readFile(file, "utf8"), before);
});

test("serializes concurrent saves and edits across multiple store instances; readers see valid JSON", async t => {
  const { store, file } = await fixture(t);
  await store.save(sample({ name: "seed" }));
  const second = new LibraryStore(file);
  let observing = true, reads = 0;
  const observer = (async () => {
    while (observing) {
      const document = JSON.parse(await fs.readFile(file, "utf8"));
      assert.equal(document.version, 1);
      assert.ok(document.entries.length > 0);
      reads++;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  })();
  let entries;
  try {
    const saves = Array.from({ length: 30 }, (_, i) => (i % 2 ? second : store).save(sample({ name: `Concurrent ${i}` })));
    const lists = Array.from({ length: 15 }, (_, i) => (i % 2 ? second : store).list());
    const results = await Promise.all([...saves, ...lists]);
    entries = results.slice(0, saves.length);
    await Promise.all(entries.flatMap((entry, i) => [(i % 2 ? store : second).update(entry.id, { favorite: true }), store.get(entry.id)]));
  } finally { observing = false; await observer; }
  assert.ok(reads > 0);
  const persisted = await new LibraryStore(file).list();
  assert.equal(persisted.length, 31);
  assert.equal(new Set(persisted.map(entry => entry.id)).size, 31);
  assert.equal(persisted.filter(entry => entry.favorite).length, 30);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ["dna-library.json"]);
});

test("refuses corrupt/unsupported files on read and mutation, leaving every byte intact", async t => {
  const { store, file } = await fixture(t);
  const entry = await store.save(sample());
  const valid = JSON.parse(await fs.readFile(file, "utf8"));
  const corruptDocuments = ["{broken", "null", JSON.stringify({ version: 2, entries: [] }),
    JSON.stringify({ ...valid, entries: [{ ...entry, dna: "bad" }] }),
    JSON.stringify({ ...valid, entries: [{ ...entry, thumbnail: { future: true } }] }),
    JSON.stringify({ ...valid, entries: [entry, entry] }),
    JSON.stringify({ ...valid, entries: [{ ...entry, updatedAt: "yesterday" }] }),
    JSON.stringify({ ...valid, futureData: [1, 2, 3] })];
  for (const content of corruptDocuments) {
    await fs.writeFile(file, content);
    for (const action of [() => store.list(), () => store.get(entry.id), () => store.save(sample()), () => store.update(entry.id, { name: "Renamed" }), () => store.remove(entry.id)]) {
      await assert.rejects(action());
      assert.equal(await fs.readFile(file, "utf8"), content);
    }
  }
  // Replacing a corrupt file with a valid backup recovers the queue.
  await fs.writeFile(file, JSON.stringify(valid));
  assert.equal((await store.list()).length, 1);
});

test("failed atomic replacement preserves the original and cleans its temporary file", async t => {
  const { store, file } = await fixture(t);
  await store.save(sample());
  const before = await fs.readFile(file, "utf8");
  const originalRename = fs.rename;
  const originalRenameSync = fsSync.renameSync;
  fs.rename = async (source, destination) => {
    if (destination === file) { const error = new Error("simulated rename failure"); error.code = "EACCES"; throw error; }
    return originalRename(source, destination);
  };
  fsSync.renameSync = (source, destination) => {
    if (destination === file) { const error = new Error("simulated rename failure"); error.code = "EACCES"; throw error; }
    return originalRenameSync(source, destination);
  };
  try { await assert.rejects(store.save(sample({ name: "Must not appear" })), { code: "EACCES" }); }
  finally { fs.rename = originalRename; fsSync.renameSync = originalRenameSync; }
  assert.equal(await fs.readFile(file, "utf8"), before);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ["dna-library.json"]);
  await store.save(sample({ name: "Queue still works" }));
  assert.equal((await store.list()).length, 2);
});
