const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { deflateSync } = require("node:zlib");
const { LibraryStore, BUNDLE_FORMAT, BUNDLE_VERSION, LIMITS } = require("../../src/main/library-store");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==", "base64");
const sample = overrides => ({
  name: "Älva 👑", note: "Unveränderte Notiz\nZeile zwei", favorite: true,
  dna: "AAECA//+/fw=", originalDna: 'dna = "AAECA//+/fw="\n# Exact original input', sex: "female",
  format: "encoded", profile: "epe", sourceProfile: "none",
  schemaInfo: { source: { fingerprint: "α", version: "1.2" }, target: { fingerprint: "β" } },
  lossReport: [{ gene: "test", reason: "Exact loss note" }], ...overrides
});
const clone = value => JSON.parse(JSON.stringify(value));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function withImageData(data) {
  const content = Buffer.concat([Buffer.from("IDAT"), data]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length); content.copy(chunk, 4);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(png.length - 12)]);
}

async function fixture(t) {
  await fs.mkdir(path.join(__dirname, "tests"), { recursive: true });
  const directory = await fs.mkdtemp(path.join(__dirname, "tests", "bundle-test-"));
  t.after(async () => {
    // Fixture paths are generated strictly beneath this test workspace.
    assert.equal(path.dirname(directory), path.join(__dirname, "tests"));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, "dna-library.json");
  return { directory, file, portraits: path.join(directory, "portraits"), store: new LibraryStore(file) };
}

async function sourceBundle(t) {
  const fixtureData = await fixture(t);
  const entry = await fixtureData.store.save(sample());
  await fixtureData.store.setPortrait(entry.id, png, { width: 1, height: 1 });
  return { ...fixtureData, entry, bundle: await fixtureData.store.exportBundle() };
}

test("JSON bundle round trips exact original/converted DNA, metadata and portraits into independent copies", async t => {
  const { bundle, entry } = await sourceBundle(t);
  const { store, file, portraits } = await fixture(t);
  const textEntry = await store.save(sample({ name: "Text DNA", dna: "ruler_designer_0 = { genes = { hair_color = { 1 2 3 4 } } }", format: "ruler_designer", sex: "male" }));
  const textBundle = await store.exportBundle();
  assert.equal(bundle.format, BUNDLE_FORMAT);
  assert.equal(bundle.version, BUNDLE_VERSION);
  assert.deepEqual(bundle.entries[0].thumbnail, { width: 1, height: 1, sha256: sha(png), data: png.toString("base64") });
  assert.ok(!Object.hasOwn(bundle.entries[0].thumbnail, "file"));
  const result = await store.importBundle(clone(bundle));
  assert.equal(result.count, 1);
  assert.deepEqual(result.ids, [result.firstId]);
  assert.notEqual(result.firstId, entry.id);
  const imported = await new LibraryStore(file).get(result.firstId);
  for (const key of ["name", "note", "favorite", "dna", "originalDna", "sex", "profile", "sourceProfile", "format", "schemaInfo", "lossReport"]) assert.deepEqual(imported[key], bundle.entries[0][key], key);
  assert.equal((await store.getPortrait(imported.id)).dataUrl, `data:image/png;base64,${png.toString("base64")}`);
  assert.ok(imported.thumbnail.file.startsWith(imported.id + "-"));
  assert.deepEqual(await fs.readFile(path.join(portraits, imported.thumbnail.file)), png);
  const importedText = await store.importBundle(textBundle);
  assert.equal((await store.get(importedText.firstId)).dna, textEntry.dna);
  assert.equal((await store.get(importedText.firstId)).name, "Text DNA (Import)");
  assert.equal((await store.get(importedText.firstId)).sex, "male");
});

test("reimport never overwrites local entries and assigns bounded, distinct conflict names", async t => {
  const { store, entry, bundle } = await sourceBundle(t);
  const existing = await store.get(entry.id);
  const first = await store.importBundle(bundle);
  const second = await store.importBundle(bundle);
  assert.equal((await store.get(first.firstId)).name, entry.name + " (Import)");
  assert.equal((await store.get(second.firstId)).name, entry.name + " (Import 2)");
  assert.deepEqual(await store.get(entry.id), existing);
  assert.equal(new Set((await store.list()).map(item => item.id)).size, 3);
  const longName = "x".repeat(LIMITS.name);
  const long = await store.save(sample({ name: longName }));
  const exported = await store.exportBundle();
  exported.entries = exported.entries.filter(item => item.id === long.id);
  const copy = await store.importBundle(exported);
  assert.equal((await store.get(copy.firstId)).name.length, LIMITS.name);
  assert.ok((await store.get(copy.firstId)).name.endsWith(" (Import)"));
});

test("all bundle metadata and portrait bytes validate before any mutation, including CRC and traversal attempts", async t => {
  const { bundle } = await sourceBundle(t);
  const { store, file, portraits } = await fixture(t);
  await store.save(sample({ name: "Existing user entry" }));
  const before = await fs.readFile(file, "utf8");
  const malformed = [];
  for (const patch of [
    { note: "x".repeat(LIMITS.note + 1) }, { favorite: "true" }, { sex: "other" },
    { originalDna: "" }, { profile: "other" }, { dna: "bad" }, { lossReport: {} },
    { schemaInfo: JSON.parse('{"__proto__":{"path":"../../outside"}}') },
    { thumbnail: { ...bundle.entries[0].thumbnail, file: "../../outside.png" } },
    { thumbnail: { ...bundle.entries[0].thumbnail, data: "data:image/png;base64," + png.toString("base64") } },
    { thumbnail: { ...bundle.entries[0].thumbnail, sha256: "0".repeat(64) } },
    { thumbnail: { ...bundle.entries[0].thumbnail, width: 2 } },
    { filePath: "C:\\outside.png" }
  ]) malformed.push({ ...clone(bundle), entries: [clone(bundle.entries[0]), { ...clone(bundle.entries[0]), ...patch }] });
  const corrupted = Buffer.from(png); corrupted[corrupted.length - 1] ^= 1;
  for (const bytes of [corrupted, withImageData(Buffer.from("not zlib")), withImageData(deflateSync(Buffer.alloc(1000000))), withImageData(deflateSync(Buffer.from([5, 255, 0, 0, 255])))]) {
    malformed.push({ ...clone(bundle), entries: [{ ...clone(bundle.entries[0]), thumbnail: { width: 1, height: 1, sha256: sha(bytes), data: bytes.toString("base64") } }] });
  }
  malformed.push({ ...clone(bundle), format: "other" }, { ...clone(bundle), version: 2 }, { ...clone(bundle), unexpectedPath: "../outside" });
  for (const input of malformed) {
    await assert.rejects(store.importBundle(input));
    assert.equal(await fs.readFile(file, "utf8"), before);
    await assert.rejects(fs.stat(portraits), { code: "ENOENT" });
  }
});

test("bundle and combined library entry/byte limits reject the entire import", async t => {
  const { bundle } = await sourceBundle(t);
  const { store, file } = await fixture(t);
  await store.save(sample());
  const before = await fs.readFile(file, "utf8");
  const withoutImage = { ...bundle.entries[0], thumbnail: null };
  await assert.rejects(store.importBundle({ ...bundle, entries: Array(LIMITS.entries + 1).fill(withoutImage) }));
  await assert.rejects(store.importBundle({ ...bundle, entries: Array(LIMITS.entries).fill(withoutImage) }));
  const largeEntry = { ...withoutImage, originalDna: "x".repeat(LIMITS.dna) };
  await assert.rejects(store.importBundle({ ...bundle, entries: Array(34).fill(largeEntry) }), /64 MB/);
  assert.equal(await fs.readFile(file, "utf8"), before);
});

test("failed final commit removes staged images and preserves every existing library byte", async t => {
  const { store, file, portraits, bundle } = await sourceBundle(t);
  const before = await fs.readFile(file, "utf8");
  const images = await fs.readdir(portraits);
  const write = store._write;
  store._write = async () => { throw new Error("simulated commit failure"); };
  try { await assert.rejects(store.importBundle({ ...bundle, entries: [...bundle.entries, ...bundle.entries] }), /simulated commit failure/); }
  finally { store._write = write; }
  assert.equal(await fs.readFile(file, "utf8"), before);
  assert.deepEqual(await fs.readdir(portraits), images);
  assert.equal((await store.getPortrait(bundle.entries[0].id)).dataUrl, `data:image/png;base64,${png.toString("base64")}`);
});

test("missing or tampered local portraits refuse export explicitly and preserve the library", async t => {
  const { store, file, portraits, entry } = await sourceBundle(t);
  const saved = await store.get(entry.id);
  const before = await fs.readFile(file, "utf8");
  const portraitPath = path.join(portraits, saved.thumbnail.file);
  await fs.unlink(portraitPath);
  await assert.rejects(store.exportBundle(), { code: "LIBRARY_PORTRAIT_UNAVAILABLE" });
  await fs.writeFile(portraitPath, Buffer.from("changed bytes"));
  await assert.rejects(store.exportBundle(), { code: "LIBRARY_PORTRAIT_UNAVAILABLE" });
  assert.equal(await fs.readFile(file, "utf8"), before);
});

test("import snapshots caller memory and commits all imported entries in one write", async t => {
  const { bundle } = await sourceBundle(t);
  const { store } = await fixture(t);
  const write = store._write.bind(store);
  let writes = 0;
  store._write = async document => { writes++; return write(document); };
  bundle.entries.push(clone(bundle.entries[0]));
  const pending = store.importBundle(bundle);
  bundle.entries[0].dna = "bad";
  bundle.entries[0].schemaInfo.source.fingerprint = "changed";
  bundle.entries[1].thumbnail.data = "bad";
  const result = await pending;
  assert.equal(result.count, 2);
  assert.equal(writes, 1);
  for (const id of result.ids) {
    const entry = await store.get(id);
    assert.equal(entry.dna, sample().dna);
    assert.equal(entry.schemaInfo.source.fingerprint, "α");
    assert.ok(await store.getPortrait(id));
  }
});

test("close waits for accepted mutations, refuses new work, and leaves durable data after reopening", async t => {
  const { store, file } = await fixture(t);
  const initial = await store.save(sample());
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const write = store._write.bind(store);
  store._write = async document => { await gate; return write(document); };
  const save = store.save(sample({ name: "Accepted save" }));
  const portrait = store.setPortrait(initial.id, png, { width: 1, height: 1 });
  const edit = store.update(initial.id, { note: "Accepted edit" });
  let closed = false;
  const closing = store.close().then(() => { closed = true; });
  await assert.rejects(store.save(sample({ name: "Too late" })), { code: "LIBRARY_CLOSED" });
  await assert.rejects(store.remove(initial.id), { code: "LIBRARY_CLOSED" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, false);
  release();
  await Promise.all([save, portrait, edit, closing, store.drain(), store.close()]);
  const reopened = new LibraryStore(file);
  assert.deepEqual((await reopened.list()).map(entry => entry.name), [initial.name, "Accepted save"]);
  assert.equal((await reopened.get(initial.id)).note, "Accepted edit");
  assert.ok(await reopened.getPortrait(initial.id));
});
