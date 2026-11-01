const fs = require("fs/promises");
const fsNative = require("fs");
const path = require("path");
const { randomUUID, createHash } = require("crypto");
const { inflateSync } = require("zlib");

const LIBRARY_VERSION = 1;
const BUNDLE_FORMAT = "ck3-dna-library";
const BUNDLE_VERSION = 1;
const LIMITS = Object.freeze({ name: 120, note: 2000, dna: 1900000, metadata: 512000, lossReport: 2000000, entries: 1000, fileBytes: 64000000, portraitBytes: 8 * 1024 * 1024, portraitDimension: 1600 });
const PROFILES = new Set(["none", "epe", "agot"]);
const FORMATS = new Set(["encoded", "ruler_designer"]);
const SEXES = new Set(["male", "female", "unspecified"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PORTRAIT_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-([0-9a-f]{64})\.png$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const queues = new Map();
const entryKeys = ["id", "name", "note", "favorite", "dna", "format", "profile", "sourceProfile", "schemaInfo", "lossReport", "thumbnail", "createdAt", "updatedAt"];
const optionalEntryKeys = ["originalDna", "sex", "verification", "importMetadata"];
const saveKeys = ["name", "note", "favorite", "dna", "format", "profile", "sourceProfile", "schemaInfo", "lossReport", "thumbnail", ...optionalEntryKeys];

function fail(message, code = "LIBRARY_INVALID_INPUT") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function object(value, label, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${label} muss ein Objekt sein.`);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} enthält unbekannte Felder.`);
}

function string(value, label, max, required = false) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`${label} ist ungültig oder zu lang (maximal ${max} Zeichen).`);
  if (required && !value.trim()) fail(`${label} darf nicht leer sein.`);
  return value;
}

function jsonValue(value, label, max, fallback) {
  if (value === undefined) return fallback;
  let nodes = 0;
  function check(item, depth) {
    if (++nodes > 50000 || depth > 20) fail(`${label} ist zu umfangreich.`);
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (Array.isArray(item)) { item.forEach(child => check(child, depth + 1)); return; }
    if (item && typeof item === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(item))) {
      for (const key of Object.keys(item)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) fail(`${label} enthält einen ungültigen Schlüssel.`);
        check(item[key], depth + 1);
      }
      return;
    }
    fail(`${label} muss gültige JSON-Daten enthalten.`);
  }
  check(value, 0);
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > max) fail(`${label} ist zu umfangreich.`);
  return JSON.parse(text);
}

function validateDna(dna, format) {
  string(dna, "DNA", LIMITS.dna, true);
  if (format === "encoded") {
    if (dna.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dna)) fail("DNA muss reines, korrekt aufgefülltes Base64 sein.");
    const decoded = Buffer.from(dna, "base64");
    if (!decoded.length || decoded.length % 4 !== 0 || decoded.toString("base64") !== dna) fail("Die Base64-DNA ist nicht kanonisch oder enthält unvollständige Gene.");
    return;
  }
  // Check the generated CK3 text envelope without changing a single DNA character.
  // Braces in quoted strings and comments do not belong to the block structure.
  let depth = 0, quoted = false, escaped = false, comment = false, structural = "";
  for (const character of dna) {
    if (comment) { if (character === "\n") { comment = false; structural += "\n"; } continue; }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === "#") { comment = true; continue; }
    if (character === '"') { quoted = true; structural += "\"\""; continue; }
    if (character === "{") depth++;
    if (character === "}" && --depth < 0) fail("Text-DNA enthält unausgeglichene Klammern.");
    structural += character;
  }
  if (quoted || depth !== 0 || !/(?:^|[\s{])genes\s*=\s*\{/.test(structural)) fail("Text-DNA muss einen vollständigen genes-Block enthalten.");
}

function validateSave(value) {
  object(value, "Bibliothekseintrag", saveKeys);
  if (value.thumbnail !== undefined && value.thumbnail !== null) fail("Porträts können nur über die Bildauswahl gespeichert werden.");
  const name = string(value.name, "Name", LIMITS.name, true).trim();
  const note = string(value.note === undefined ? "" : value.note, "Notiz", LIMITS.note);
  const favorite = value.favorite === undefined ? false : value.favorite;
  if (typeof favorite !== "boolean") fail("Favorit muss ein Wahrheitswert sein.");
  const archival = value.format === "original";
  if (!FORMATS.has(value.format) && !archival) fail("Unbekanntes DNA-Format.");
  if (archival) {
    // Archiving makes no claim about parsing, schema compatibility or validity.
    // Keep this state explicit so it cannot bypass canonical working-DNA checks.
    if (value.verification !== "unverified" || value.profile !== "unknown" || value.sourceProfile !== "unknown") fail("Original-DNA muss ausdrücklich als ungeprüft gespeichert werden.");
    string(value.dna, "Original-DNA", LIMITS.dna, true);
  } else {
    if (!PROFILES.has(value.profile) || !PROFILES.has(value.sourceProfile)) fail("Unbekanntes Quell- oder Zielprofil.");
    if (value.verification !== undefined && value.verification !== "validated") fail("Ungültiger Prüfstatus für Arbeits-DNA.");
    validateDna(value.dna, value.format);
  }
  // Source input can use any supported input envelope. Preserve its exact text;
  // only the converted DNA above is subject to canonical output validation.
  const originalDna = value.originalDna === undefined || value.originalDna === null ? null : string(value.originalDna, "Original-DNA", LIMITS.dna, true);
  const sex = value.sex === undefined ? "unspecified" : value.sex;
  if (!SEXES.has(sex)) fail("Unbekanntes Geschlecht.");
  const schemaInfo = jsonValue(value.schemaInfo, "Schema-Informationen", LIMITS.metadata, null);
  if (schemaInfo !== null && (typeof schemaInfo !== "object" || Array.isArray(schemaInfo))) fail("Schema-Informationen müssen ein Objekt sein.");
  const lossReport = jsonValue(value.lossReport, "Verlustbericht", LIMITS.lossReport, []);
  if (!Array.isArray(lossReport)) fail("Verlustbericht muss eine Liste sein.");
  if (archival && (schemaInfo !== null || lossReport.length || (originalDna !== null && originalDna !== value.dna))) fail("Ungeprüfte Original-DNA darf keine abweichende Arbeitsfassung oder geprüfte Schema-Daten enthalten.");
  const result = { name, note, favorite, dna: value.dna, originalDna: archival ? value.dna : originalDna, sex, format: value.format, profile: value.profile, sourceProfile: value.sourceProfile, schemaInfo, lossReport };
  if (value.verification !== undefined) result.verification = value.verification;
  if (value.importMetadata !== undefined) {
    const metadata = jsonValue(value.importMetadata, "Import metadata", LIMITS.lossReport, null);
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) fail('Import metadata must be an object.');
    result.importMetadata = metadata;
  }
  return result;
}

function validateId(id) {
  if (typeof id !== "string" || !UUID.test(id)) fail("Ungültige Bibliotheks-ID.");
}

function validatePortraitDimensions(value) {
  object(value, "Porträtgröße", ["width", "height"]);
  for (const key of ["width", "height"]) {
    if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > LIMITS.portraitDimension) fail("Das Porträt hat eine ungültige Bildgröße.");
  }
}

function validateThumbnail(value) {
  if (value === null) return;
  object(value, "Porträt", ["file", "width", "height"]);
  if (typeof value.file !== "string" || !PORTRAIT_FILE.test(value.file)) fail("Das Porträt hat einen ungültigen Dateinamen.");
  validatePortraitDimensions({ width: value.width, height: value.height });
}

// The main process decodes and normalizes images. Independently check the PNG
// envelope here so a malformed/truncated file can never become a library asset.
function validatePng(bytes, dimensions) {
  validatePortraitDimensions(dimensions);
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > LIMITS.portraitBytes || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) fail("Das Porträt muss ein gültiges PNG mit höchstens 8 MiB sein.");
  let offset = 8, sawHeader = false, sawData = false, sawEnd = false, dataEnded = false, palette = false;
  let bitDepth, colorType, interlace;
  const imageData = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) fail("Das PNG-Porträt ist unvollständig.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) fail("Das PNG-Porträt enthält ungültige Daten.");
    let crc = 0xffffffff;
    for (let index = offset + 4; index < offset + 8 + length; index++) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(offset + 8 + length)) fail("Die PNG-Prüfsumme ist ungültig.");
    if (!sawHeader && (type !== "IHDR" || length !== 13)) fail("Das PNG-Porträt hat keinen gültigen Bildkopf.");
    if (type === "IHDR") {
      if (sawHeader || length !== 13 || bytes.readUInt32BE(offset + 8) !== dimensions.width || bytes.readUInt32BE(offset + 12) !== dimensions.height) fail("Die Porträtgröße stimmt nicht mit dem PNG überein.");
      bitDepth = bytes[offset + 16]; colorType = bytes[offset + 17]; interlace = bytes[offset + 20];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[colorType]?.includes(bitDepth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || interlace > 1) fail("Der PNG-Bildkopf ist ungültig.");
      sawHeader = true;
    }
    if (type === "PLTE") {
      if (palette || sawData || !length || length % 3 || length > 768 || [0, 4].includes(colorType)) fail("Die PNG-Farbpalette ist ungültig.");
      palette = true;
    }
    if (type === "IDAT") {
      if (dataEnded || (colorType === 3 && !palette)) fail("Die PNG-Bilddaten sind ungültig.");
      sawData = true;
      imageData.push(bytes.subarray(offset + 8, offset + 8 + length));
    } else if (sawData) dataEnded = true;
    if (type[0] === type[0].toUpperCase() && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) fail("Das PNG enthält unbekannte Pflichtdaten.");
    if (type === "IEND") {
      if (length !== 0 || !sawData) fail("Das PNG-Porträt enthält keine vollständigen Bilddaten.");
      sawEnd = true;
    }
    offset += length + 12;
    if (sawEnd) break;
  }
  if (!sawEnd || offset !== bytes.length) fail("Das PNG-Porträt ist unvollständig.");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = [];
  let expected = 0;
  for (const [x, y, dx, dy] of passes) {
    const width = Math.max(0, Math.ceil((dimensions.width - x) / dx));
    const height = Math.max(0, Math.ceil((dimensions.height - y) / dy));
    if (!width || !height) continue;
    const size = Math.ceil(width * channels * bitDepth / 8) + 1;
    rows.push({ size, height }); expected += size * height;
  }
  let decoded;
  try { decoded = inflateSync(Buffer.concat(imageData), { maxOutputLength: expected + 1 }); }
  catch (_) { fail("Die PNG-Bilddaten sind beschädigt."); }
  if (decoded.length !== expected) fail("Die PNG-Bilddaten haben eine ungültige Länge.");
  let rowOffset = 0;
  for (const { size, height } of rows) for (let row = 0; row < height; row++, rowOffset += size) {
    if (decoded[rowOffset] > 4) fail("Das PNG enthält einen ungültigen Bildfilter.");
  }
}

function portraitHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateBundle(bundle) {
  object(bundle, "Bibliothekspaket", ["format", "version", "entries"]);
  if (bundle.format !== BUNDLE_FORMAT || bundle.version !== BUNDLE_VERSION) fail("Dieses Bibliothekspaket wird nicht unterstützt.", "LIBRARY_UNSUPPORTED_VERSION");
  if (!Array.isArray(bundle.entries) || bundle.entries.length > LIMITS.entries) fail("Das Bibliothekspaket enthält zu viele Einträge.");
  let totalBytes = Buffer.byteLength(JSON.stringify({ format: BUNDLE_FORMAT, version: BUNDLE_VERSION, entries: [] }));
  return bundle.entries.map((entry, index) => {
    object(entry, "Importeintrag", [...entryKeys, ...optionalEntryKeys]);
    if (entryKeys.some(key => !Object.hasOwn(entry, key))) fail("Ein Importeintrag ist unvollständig.");
    validateId(entry.id);
    for (const key of ["createdAt", "updatedAt"]) {
      if (typeof entry[key] !== "string" || !Number.isFinite(Date.parse(entry[key])) || new Date(entry[key]).toISOString() !== entry[key]) fail("Ein Importzeitstempel ist ungültig.");
    }
    // Source identities, timestamps and filenames never select a local record.
    // All editable metadata follows exactly the same validation as a new save.
    const payload = validateSave({ ...Object.fromEntries(saveKeys.map(key => [key, entry[key]])), thumbnail: null });
    let portrait = null;
    if (entry.thumbnail !== null) {
      object(entry.thumbnail, "Importporträt", ["width", "height", "sha256", "data"]);
      const { width, height, sha256, data } = entry.thumbnail;
      validatePortraitDimensions({ width, height });
      if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) fail("Die Porträt-Prüfsumme ist ungültig.");
      if (typeof data !== "string" || !data.length || data.length > 4 * Math.ceil(LIMITS.portraitBytes / 3) || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) fail("Das Importporträt enthält ungültiges Base64.");
      portrait = { width, height, sha256, data };
    }
    // Count before decoding images, and before waiting for a filesystem turn.
    // JSON size includes metadata, inline bytes and all serialization overhead.
    let serialized;
    try { serialized = JSON.stringify(entry); } catch (_) { fail("Der Importeintrag enthält ungültige Daten."); }
    totalBytes += Buffer.byteLength(serialized, "utf8") + (index ? 1 : 0);
    if (totalBytes > LIMITS.fileBytes) fail("Das Bibliothekspaket ist größer als 64 MB.");
    if (portrait) {
      const bytes = Buffer.from(portrait.data, "base64");
      if (bytes.toString("base64") !== portrait.data) fail("Das Importporträt enthält nichtkanonisches Base64.");
      validatePng(bytes, { width: portrait.width, height: portrait.height });
      if (portraitHash(bytes) !== portrait.sha256) fail("Die Porträt-Prüfsumme stimmt nicht überein.");
      portrait = { bytes, width: portrait.width, height: portrait.height };
    }
    return { payload, portrait };
  });
}

function importedName(name, names) {
  const key = value => value.toLowerCase();
  if (!names.has(key(name))) { names.add(key(name)); return name; }
  for (let count = 1; ; count++) {
    const suffix = count === 1 ? " (Import)" : ` (Import ${count})`;
    let prefix = name.slice(0, LIMITS.name - suffix.length).trimEnd();
    // Do not split a UTF-16 surrogate pair while reserving room for the suffix.
    if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
    const candidate = prefix + suffix;
    if (!names.has(key(candidate))) { names.add(key(candidate)); return candidate; }
  }
}

function validateDocument(document) {
  object(document, "Bibliotheksdatei", ["version", "entries"]);
  if (document.version !== LIBRARY_VERSION) fail("Die Version der DNA-Bibliothek wird nicht unterstützt. Die Datei wurde nicht verändert.", "LIBRARY_UNSUPPORTED_VERSION");
  if (!Array.isArray(document.entries) || document.entries.length > LIMITS.entries) fail("Die Bibliotheksdatei enthält eine ungültige Eintragsliste.");
  const ids = new Set();
  for (const entry of document.entries) {
    object(entry, "Gespeicherter Eintrag", [...entryKeys, ...optionalEntryKeys]);
    if (entryKeys.some(key => !Object.hasOwn(entry, key))) fail("Ein gespeicherter Eintrag ist unvollständig.");
    validateId(entry.id);
    if (ids.has(entry.id)) fail("Die Bibliothek enthält doppelte IDs.");
    ids.add(entry.id);
    const payload = Object.fromEntries(saveKeys.map(key => [key, entry[key]]));
    validateSave({ ...payload, thumbnail: null });
    validateThumbnail(entry.thumbnail);
    for (const key of ["createdAt", "updatedAt"]) {
      if (typeof entry[key] !== "string" || !Number.isFinite(Date.parse(entry[key])) || new Date(entry[key]).toISOString() !== entry[key]) fail("Ein gespeicherter Zeitstempel ist ungültig.");
    }
    if (entry.updatedAt < entry.createdAt) fail("Die gespeicherten Zeitstempel sind widersprüchlich.");
  }
  return document;
}

class LibraryStore {
  constructor(filePath) {
    if (typeof filePath !== "string" || !filePath || !path.isAbsolute(filePath)) fail("Die Bibliotheksdatei benötigt einen festen absoluten Pfad.");
    this.filePath = path.resolve(filePath);
    this.portraitDirectory = path.join(path.dirname(this.filePath), "portraits");
    this.queueKey = process.platform === "win32" ? this.filePath.toLowerCase() : this.filePath;
    this.closing = false;
  }

  // All instances pointing at the same app-owned file share the mutation queue.
  _queue(action) {
    if (this.closing) return Promise.reject(Object.assign(new Error("Die DNA-Bibliothek wird geschlossen."), { code: "LIBRARY_CLOSED" }));
    const previous = queues.get(this.queueKey) || Promise.resolve();
    const operation = previous.then(action);
    const settled = operation.catch(() => {});
    queues.set(this.queueKey, settled);
    settled.then(() => { if (queues.get(this.queueKey) === settled) queues.delete(this.queueKey); });
    return operation;
  }

  // close() stops admission synchronously; work already accepted keeps its turn.
  drain() { return queues.get(this.queueKey) || Promise.resolve(); }

  close() {
    this.closing = true;
    return this.drain();
  }

  async _read() {
    let text;
    try {
      const stat = await fs.stat(this.filePath);
      if (stat.size > LIMITS.fileBytes) fail("Die Bibliotheksdatei ist zu groß.");
      text = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { version: LIBRARY_VERSION, entries: [] };
      throw error;
    }
    try {
      return validateDocument(JSON.parse(text));
    } catch (error) {
      if (error.code === "LIBRARY_UNSUPPORTED_VERSION") throw error;
      fail("Die DNA-Bibliothek ist beschädigt oder enthält ungültige Daten. Die Datei wurde nicht verändert.", "LIBRARY_CORRUPT");
    }
  }

  async _write(document) {
    const text = JSON.stringify(document, null, 2) + "\n";
    if (Buffer.byteLength(text, "utf8") > LIMITS.fileBytes) fail("Die Bibliotheksdatei ist zu groß.");
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, "wx", 0o600);
      await handle.writeFile(text, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      // Windows readers and antivirus scanners can briefly hold the destination.
      // Retrying replacement keeps the old file intact throughout that interval.
      for (let attempt = 0; ; attempt++) {
        try {
          // On Windows, dispatching replacement through the worker pool can race
          // a queued asynchronous reader opening the same file. Replacement is
          // one short filesystem operation; execute it in this queue turn.
          if (process.platform === "win32") fsNative.renameSync(temporary, this.filePath);
          else await fs.rename(temporary, this.filePath);
          break;
        }
        catch (error) {
          if (attempt >= 6 || !["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
          // Avoid repeatedly colliding with a polling reader at a fixed cadence.
          const delay = 11 * 2 ** attempt + Math.floor(Math.random() * 23);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } finally {
      if (handle) await handle.close().catch(() => {});
      await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }

  async list() {
    return this._queue(async () => (await this._read()).entries);
  }

  async get(id) {
    validateId(id);
    return this._queue(async () => (await this._read()).entries.find(entry => entry.id === id) || null);
  }

  async _checkPortraitDirectory(create = false) {
    if (create) await fs.mkdir(this.portraitDirectory, { recursive: true });
    const stat = await fs.lstat(this.portraitDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("Der Porträtordner ist ungültig.");
  }

  async _deletePortrait(thumbnail, document) {
    if (!thumbnail || document.entries.some(entry => entry.thumbnail && entry.thumbnail.file === thumbnail.file)) return;
    // Cleanup must never turn a successfully committed change into a failure.
    // Only generated basenames in the app-owned directory are ever removed.
    try {
      validateThumbnail(thumbnail);
      await this._checkPortraitDirectory();
      await fs.unlink(path.join(this.portraitDirectory, thumbnail.file));
    } catch (_) { /* A missing or locked orphan can safely remain on disk. */ }
  }

  async _readPortrait(thumbnail) {
    let handle;
    try {
      await this._checkPortraitDirectory();
      const file = path.join(this.portraitDirectory, thumbnail.file);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.portraitBytes) return null;
      handle = await fs.open(file, "r");
      // Read at most the advertised size plus one byte, even if a file grows.
      const buffer = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await handle.read(buffer, length, buffer.length - length, length);
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      const bytes = buffer.subarray(0, length);
      const dimensions = { width: thumbnail.width, height: thumbnail.height };
      validatePng(bytes, dimensions);
      if (portraitHash(bytes) !== PORTRAIT_FILE.exec(thumbnail.file)[1]) return null;
      return { bytes, ...dimensions };
    } catch (error) {
      if (["ENOENT", "LIBRARY_INVALID_INPUT"].includes(error.code)) return null;
      throw error;
    } finally {
      if (handle) await handle.close();
    }
  }

  async getPortrait(id) {
    validateId(id);
    return this._queue(async () => {
      const entry = (await this._read()).entries.find(item => item.id === id);
      if (!entry || !entry.thumbnail) return null;
      const portrait = await this._readPortrait(entry.thumbnail);
      return portrait ? { dataUrl: `data:image/png;base64,${portrait.bytes.toString("base64")}`, width: portrait.width, height: portrait.height } : null;
    });
  }

  async exportBundle(id) {
    if (id !== undefined) validateId(id);
    return this._queue(async () => {
      const document = await this._read();
      if (id !== undefined && !document.entries.some(entry => entry.id === id)) fail("Der Bibliothekseintrag existiert nicht mehr.", "LIBRARY_NOT_FOUND");
      const bundle = { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, entries: [] };
      let totalBytes = Buffer.byteLength(JSON.stringify(bundle), "utf8");
      for (const entry of document.entries) {
        if (id !== undefined && entry.id !== id) continue;
        let thumbnail = null;
        if (entry.thumbnail) {
          const portrait = await this._readPortrait(entry.thumbnail);
          if (!portrait) fail(`Das Porträt für „${entry.name}“ fehlt oder ist beschädigt. Bitte neu auswählen oder entfernen und den Export wiederholen.`, "LIBRARY_PORTRAIT_UNAVAILABLE");
          thumbnail = { width: portrait.width, height: portrait.height, sha256: portraitHash(portrait.bytes), data: portrait.bytes.toString("base64") };
        }
        const exported = { ...entry, thumbnail };
        totalBytes += Buffer.byteLength(JSON.stringify(exported), "utf8") + (bundle.entries.length ? 1 : 0);
        if (totalBytes > LIMITS.fileBytes) fail("Das Bibliothekspaket ist größer als 64 MB.");
        bundle.entries.push(exported);
      }
      return bundle;
    });
  }

  async importBundle(bundle) {
    // Fully validate and snapshot the caller's payload before any file is made.
    const imported = validateBundle(bundle);
    return this._queue(async () => {
      const document = await this._read();
      if (document.entries.length + imported.length > LIMITS.entries) fail("Die Bibliothek bietet nicht genügend Platz für alle Importeinträge.");
      if (!imported.length) return { count: 0, firstId: null, ids: [] };
      const names = new Set(document.entries.map(entry => entry.name.toLowerCase()));
      const now = new Date().toISOString();
      const staged = [], ids = [];
      let committed = false;
      try {
        for (const { payload, portrait } of imported) {
          const id = randomUUID();
          let thumbnail = null;
          if (portrait) {
            thumbnail = { file: `${id}-${portraitHash(portrait.bytes)}.png`, width: portrait.width, height: portrait.height };
            await this._checkPortraitDirectory(true);
            const file = path.join(this.portraitDirectory, thumbnail.file);
            const handle = await fs.open(file, "wx", 0o600);
            staged.push(file);
            try { await handle.writeFile(portrait.bytes); await handle.sync(); }
            finally { await handle.close(); }
          }
          document.entries.push({ id, ...payload, name: importedName(payload.name, names), thumbnail, createdAt: now, updatedAt: now });
          ids.push(id);
        }
        // All copies become visible together in one atomic library replacement.
        await this._write(document);
        committed = true;
        return { count: ids.length, firstId: ids[0], ids };
      } finally {
        if (!committed) await Promise.all(staged.map(file => fs.unlink(file).catch(() => {})));
      }
    });
  }

  async setPortrait(id, pngBuffer, dimensions) {
    validateId(id);
    validatePng(pngBuffer, dimensions);
    // Snapshot caller-owned memory before waiting for another library operation.
    const bytes = Buffer.from(pngBuffer);
    const size = { width: dimensions.width, height: dimensions.height };
    return this._queue(async () => {
      const document = await this._read();
      const index = document.entries.findIndex(entry => entry.id === id);
      if (index < 0) fail("Der Bibliothekseintrag existiert nicht mehr.", "LIBRARY_NOT_FOUND");
      const previous = document.entries[index];
      const thumbnail = { file: `${randomUUID()}-${portraitHash(bytes)}.png`, ...size };
      const file = path.join(this.portraitDirectory, thumbnail.file);
      let handle, created = false, committed = false;
      try {
        await this._checkPortraitDirectory(true);
        handle = await fs.open(file, "wx", 0o600);
        created = true;
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        handle = null;
        const entry = { ...previous, thumbnail, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt))).toISOString() };
        document.entries[index] = entry;
        await this._write(document);
        committed = true;
        await this._deletePortrait(previous.thumbnail, document);
        return entry;
      } finally {
        if (handle) await handle.close().catch(() => {});
        if (created && !committed) await fs.unlink(file).catch(() => {});
      }
    });
  }

  async removePortrait(id) {
    validateId(id);
    return this._queue(async () => {
      const document = await this._read();
      const index = document.entries.findIndex(entry => entry.id === id);
      if (index < 0) fail("Der Bibliothekseintrag existiert nicht mehr.", "LIBRARY_NOT_FOUND");
      const previous = document.entries[index];
      if (!previous.thumbnail) return previous;
      const entry = { ...previous, thumbnail: null, updatedAt: new Date(Math.max(Date.now(), Date.parse(previous.updatedAt))).toISOString() };
      document.entries[index] = entry;
      await this._write(document);
      await this._deletePortrait(previous.thumbnail, document);
      return entry;
    });
  }

  async save(value) {
    const payload = validateSave(value);
    return this._queue(async () => {
      const document = await this._read();
      if (document.entries.length >= LIMITS.entries) fail("Die Bibliothek ist voll. Bitte zuerst einen Eintrag löschen.");
      const now = new Date().toISOString();
      const entry = { id: randomUUID(), ...payload, thumbnail: null, createdAt: now, updatedAt: now };
      document.entries.push(entry);
      await this._write(document);
      return entry;
    });
  }

  async update(id, patch) {
    validateId(id);
    object(patch, "Änderung", ["name", "note", "favorite", "sex"]);
    const updates = {};
    if (Object.hasOwn(patch, "name")) updates.name = string(patch.name, "Name", LIMITS.name, true).trim();
    if (Object.hasOwn(patch, "note")) updates.note = string(patch.note, "Notiz", LIMITS.note);
    if (Object.hasOwn(patch, "favorite")) {
      if (typeof patch.favorite !== "boolean") fail("Favorit muss ein Wahrheitswert sein.");
      updates.favorite = patch.favorite;
    }
    if (Object.hasOwn(patch, "sex")) {
      if (!SEXES.has(patch.sex)) fail("Unbekanntes Geschlecht.");
      updates.sex = patch.sex;
    }
    if (!Object.keys(updates).length) fail("Keine Änderungen angegeben.");
    return this._queue(async () => {
      const document = await this._read();
      const index = document.entries.findIndex(entry => entry.id === id);
      if (index < 0) fail("Der Bibliothekseintrag existiert nicht mehr.", "LIBRARY_NOT_FOUND");
      const entry = { ...document.entries[index], ...updates, updatedAt: new Date(Math.max(Date.now(), Date.parse(document.entries[index].updatedAt))).toISOString() };
      document.entries[index] = entry;
      await this._write(document);
      return entry;
    });
  }

  async remove(id) {
    validateId(id);
    return this._queue(async () => {
      const document = await this._read();
      const index = document.entries.findIndex(entry => entry.id === id);
      if (index < 0) return false;
      const [entry] = document.entries.splice(index, 1);
      await this._write(document);
      await this._deletePortrait(entry.thumbnail, document);
      return true;
    });
  }
}

module.exports = { LibraryStore, LIBRARY_VERSION, BUNDLE_FORMAT, BUNDLE_VERSION, LIMITS };
