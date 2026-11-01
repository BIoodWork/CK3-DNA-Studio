const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { LibraryStore, LIMITS } = require("../../src/main/library-store");

const sample = () => ({ name: "Älva", note: "Unveränderte Notiz 👑\nZeile zwei", dna: "AAECA//+/fw=", format: "encoded", profile: "epe", sourceProfile: "none", schemaInfo: { fingerprint: "exact" }, lossReport: [{ gene: "test", reason: "exact" }] });

function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  content.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function png(red = 255, width = 1, height = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const row = Buffer.alloc(width * 4 + 1);
  for (let offset = 1; offset < row.length; offset += 4) { row[offset] = red; row[offset + 3] = 255; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(Buffer.concat(Array(height).fill(row)))), chunk("IEND", Buffer.alloc(0))]);
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(__dirname, "tests", "portrait-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "dna-library.json");
  return { file, portraits: path.join(directory, "portraits"), store: new LibraryStore(file) };
}

test("old version 1 entries load, portraits persist separately, and DNA/notes remain exact", async t => {
  const { store, file, portraits } = await fixture(t);
  const original = await store.save(sample());
  const legacy = await fs.readFile(file, "utf8");
  assert.equal(JSON.parse(legacy).version, 1);
  assert.equal((await new LibraryStore(file).list())[0].thumbnail, null);
  assert.equal(await store.getPortrait(original.id), null);
  const image = png();
  const entry = await store.setPortrait(original.id, image, { width: 1, height: 1 });
  assert.match(entry.thumbnail.file, /^[a-f0-9-]+\.png$/);
  assert.equal(entry.thumbnail.width, 1);
  const reopened = new LibraryStore(file);
  const result = await reopened.getPortrait(entry.id);
  assert.deepEqual(result, { dataUrl: `data:image/png;base64,${image.toString("base64")}`, width: 1, height: 1 });
  assert.deepEqual(await fs.readFile(path.join(portraits, entry.thumbnail.file)), image);
  const persisted = (await reopened.list())[0];
  assert.equal(persisted.dna, original.dna);
  assert.equal(persisted.note, original.note);
  assert.deepEqual(persisted.lossReport, original.lossReport);
  assert.deepEqual(persisted.schemaInfo, original.schemaInfo);
  assert.equal(persisted.createdAt, original.createdAt);
  const text = await fs.readFile(file, "utf8");
  assert.ok(!text.includes("data:image"));
  assert.ok(!text.includes(image.toString("base64")));
  assert.equal(JSON.parse(text).version, 1);
});

test("replacing and removing portraits clean old files after commits; deleting entries cleans images", async t => {
  const { store, portraits } = await fixture(t);
  const saved = await store.save(sample());
  const first = await store.setPortrait(saved.id, png(1), { width: 1, height: 1 });
  const second = await store.setPortrait(saved.id, png(2), { width: 1, height: 1 });
  assert.notEqual(second.thumbnail.file, first.thumbnail.file);
  assert.deepEqual(await fs.readdir(portraits), [second.thumbnail.file]);
  const cleared = await store.removePortrait(saved.id);
  assert.equal(cleared.thumbnail, null);
  assert.equal(cleared.dna, saved.dna);
  assert.equal(await store.getPortrait(saved.id), null);
  assert.deepEqual(await fs.readdir(portraits), []);
  assert.equal((await store.removePortrait(saved.id)).thumbnail, null);
  const third = await store.setPortrait(saved.id, png(3), { width: 1, height: 1 });
  assert.ok(third.thumbnail);
  assert.equal(await store.remove(saved.id), true);
  assert.deepEqual(await fs.readdir(portraits), []);
  assert.equal(await store.getPortrait(saved.id), null);
  await assert.rejects(store.setPortrait(saved.id, png(), { width: 1, height: 1 }), { code: "LIBRARY_NOT_FOUND" });
  await assert.rejects(store.removePortrait(saved.id), { code: "LIBRARY_NOT_FOUND" });
});

test("rejects corrupt, oversized and invalid input and renderer-supplied paths without mutations", async t => {
  const { store, file, portraits } = await fixture(t);
  const saved = await store.save(sample());
  await store.setPortrait(saved.id, png(), { width: 1, height: 1 });
  const before = await fs.readFile(file, "utf8");
  const files = await fs.readdir(portraits);
  const invalid = [
    [null, { width: 1, height: 1 }], ["file:///outside.png", { width: 1, height: 1 }],
    [Buffer.from("not an image"), { width: 1, height: 1 }], [png().subarray(0, 50), { width: 1, height: 1 }],
    [Buffer.concat([png(), Buffer.from("trailing")]), { width: 1, height: 1 }],
    [Buffer.alloc(LIMITS.portraitBytes + 1), { width: 1, height: 1 }],
    [png(), { width: 2, height: 1 }], [png(), { width: 0, height: 1 }],
    [png(), { width: 1601, height: 1 }], [png(), { width: 1.5, height: 1 }],
    [png(), { width: 1, height: 1, file: "../../outside.png" }]
  ];
  for (const [bytes, size] of invalid) await assert.rejects(store.setPortrait(saved.id, bytes, size));
  await assert.rejects(store.setPortrait("../../outside", png(), { width: 1, height: 1 }));
  await assert.rejects(store.save({ ...sample(), thumbnail: { file: files[0], width: 1, height: 1 } }));
  await assert.rejects(store.update(saved.id, { thumbnail: null }));
  assert.equal(await fs.readFile(file, "utf8"), before);
  assert.deepEqual(await fs.readdir(portraits), files);
});

test("missing, changed and oversized image files show as unavailable without damaging entries", async t => {
  const { store, file, portraits } = await fixture(t);
  const saved = await store.save(sample());
  const entry = await store.setPortrait(saved.id, png(), { width: 1, height: 1 });
  const imagePath = path.join(portraits, entry.thumbnail.file);
  const before = await fs.readFile(file, "utf8");
  await fs.unlink(imagePath);
  assert.equal(await store.getPortrait(saved.id), null);
  await fs.writeFile(imagePath, Buffer.from("corrupt"));
  assert.equal(await store.getPortrait(saved.id), null);
  await fs.writeFile(imagePath, png(10)); // Valid PNG, wrong content hash.
  assert.equal(await store.getPortrait(saved.id), null);
  await fs.writeFile(imagePath, Buffer.alloc(LIMITS.portraitBytes + 1));
  assert.equal(await store.getPortrait(saved.id), null);
  assert.equal(await fs.readFile(file, "utf8"), before);
  assert.equal((await store.get(saved.id)).dna, saved.dna);
});

test("stored path traversal and malformed image metadata are rejected without reading outside files", async t => {
  const { store, file } = await fixture(t);
  const saved = await store.save(sample());
  const document = JSON.parse(await fs.readFile(file, "utf8"));
  for (const thumbnail of [
    { file: "../../outside.png", width: 1, height: 1 }, { file: "C:\\outside.png", width: 1, height: 1 },
    { file: "portrait.png", width: 1, height: 1 }, { file: "../" + "0".repeat(64) + ".png", width: 1, height: 1 },
    { file: "e2c82841-1e93-4fb5-8154-57d3fae6007c-" + "0".repeat(64) + ".png", width: 1601, height: 1 }
  ]) {
    document.entries[0].thumbnail = thumbnail;
    const text = JSON.stringify(document);
    await fs.writeFile(file, text);
    await assert.rejects(store.getPortrait(saved.id), { code: "LIBRARY_CORRUPT" });
    await assert.rejects(store.remove(saved.id), { code: "LIBRARY_CORRUPT" });
    assert.equal(await fs.readFile(file, "utf8"), text);
  }
});

test("failed library writes preserve previous images and clean uncommitted images", async t => {
  const { store, file, portraits } = await fixture(t);
  const saved = await store.save(sample());
  const entry = await store.setPortrait(saved.id, png(1), { width: 1, height: 1 });
  const before = await fs.readFile(file, "utf8");
  const write = store._write;
  store._write = async () => { const error = new Error("simulated commit failure"); error.code = "EACCES"; throw error; };
  try {
    await assert.rejects(store.setPortrait(saved.id, png(2), { width: 1, height: 1 }), { code: "EACCES" });
    await assert.rejects(store.removePortrait(saved.id), { code: "EACCES" });
    await assert.rejects(store.remove(saved.id), { code: "EACCES" });
  } finally { store._write = write; }
  assert.equal(await fs.readFile(file, "utf8"), before);
  assert.deepEqual(await fs.readdir(portraits), [entry.thumbnail.file]);
  assert.equal((await store.getPortrait(saved.id)).dataUrl, `data:image/png;base64,${png(1).toString("base64")}`);
  await store.setPortrait(saved.id, png(3), { width: 1, height: 1 });
  assert.equal((await fs.readdir(portraits)).length, 1);
});

test("portrait writes share the existing queue across instances and snapshot input memory", async t => {
  const { store, file, portraits } = await fixture(t);
  const saved = await store.save(sample());
  const second = new LibraryStore(file);
  const bytes = png(30);
  const snapshot = Buffer.from(bytes);
  const dimensions = { width: 1, height: 1 };
  const first = store.setPortrait(saved.id, bytes, dimensions);
  bytes.fill(0); dimensions.width = 1500;
  await first;
  assert.equal((await second.getPortrait(saved.id)).dataUrl, `data:image/png;base64,${snapshot.toString("base64")}`);
  await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? second : store).setPortrait(saved.id, png(index), { width: 1, height: 1 })).concat(second.update(saved.id, { note: "Changed note" })));
  const entry = await store.get(saved.id);
  assert.equal(entry.note, "Changed note");
  assert.equal(entry.dna, saved.dna);
  assert.deepEqual(await fs.readdir(portraits), [entry.thumbnail.file]);
  assert.ok(await second.getPortrait(saved.id));
});
