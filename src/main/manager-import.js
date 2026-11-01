"use strict";

const { randomUUID, createHash } = require('crypto');
const { LIMITS, BUNDLE_FORMAT, BUNDLE_VERSION } = require('./library-store');
const MANAGER_FORMAT = 'ck3-dna-manager-qt';
function fail(message) { throw new Error(message); }
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Invalid DNA Manager export.');
}
function dnaText(value) {
  if (value !== undefined && value !== null && typeof value !== 'string') fail('DNA Manager DNA must be text.');
  if (typeof value === 'string' && value.length > LIMITS.dna) fail('DNA Manager DNA is too large.');
  return typeof value === 'string' && value.trim() ? value : null;
}

async function managerToBundle(document, { detect, normalizePortrait }) {
  object(document);
  if (document.format !== MANAGER_FORMAT || !Array.isArray(document.entries) || document.entries.length > LIMITS.entries) fail('Unsupported DNA Manager export.');
  const bundle = { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, entries: [] };
  const now = new Date().toISOString();
  let archivedCount = 0;
  let totalBytes = Buffer.byteLength(JSON.stringify(bundle));
  for (const source of document.entries) {
    object(source);
    // The documented named export retains modded keys and ruler-only fields.
    // Neither the manager's bundled slot order nor its converted Base64 is used
    // to infer a game/mod version.
    const ruler = dnaText(source.rulerDesigner), base64 = dnaText(source.base64);
    const original = ruler || base64;
    if (!original) fail('A DNA Manager entry contains no DNA.');
    let analysis = null;
    try { analysis = await detect(original); }
    catch (_) { /* Preserve unrecognized or unavailable-schema DNA as an archive. */ }
    const verified = analysis?.status === 'ready' && ['none', 'epe', 'agot'].includes(analysis.profile)
      && ['encoded', 'ruler_designer'].includes(analysis.format) && typeof analysis.encoded === 'string' && analysis.encoded.length > 0
      && analysis.schemaInfo && typeof analysis.normalized === 'string';
    if (!verified) archivedCount++;
    let thumbnail = null;
    if (source.portraitPng !== undefined && source.portraitPng !== null && source.portraitPng !== '') {
      const value = source.portraitPng;
      if (typeof value !== 'string' || value.length > 4 * Math.ceil(12 * 1024 * 1024 / 3) || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) fail('DNA Manager portrait contains invalid Base64.');
      const bytes = Buffer.from(value, 'base64');
      if (bytes.toString('base64') !== value || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('DNA Manager portrait must be a PNG image.');
      const image = normalizePortrait(bytes);
      thumbnail = { width: image.width, height: image.height, data: image.data.toString('base64'), sha256: createHash('sha256').update(image.data).digest('hex') };
    }
    const importMetadata = { format: MANAGER_FORMAT };
    for (const key of ['base64', 'rulerMeta', 'createdAt', 'updatedAt']) {
      if (source[key] !== undefined) importMetadata[key] = source[key];
    }
    const entry = {
      id: randomUUID(), name: source.name, note: source.notes ?? '', favorite: source.favorite ?? false,
      dna: verified ? analysis.normalized : original, originalDna: original,
      format: verified ? analysis.format : 'original', verification: verified ? 'validated' : 'unverified',
      profile: verified ? analysis.profile : 'unknown', sourceProfile: verified ? analysis.profile : 'unknown',
      schemaInfo: verified ? analysis.schemaInfo : null, lossReport: [], sex: 'unspecified', importMetadata,
      thumbnail, createdAt: now, updatedAt: now
    };
    totalBytes += Buffer.byteLength(JSON.stringify(entry)) + (bundle.entries.length ? 1 : 0);
    if (totalBytes > LIMITS.fileBytes) fail('DNA Manager import is too large.');
    bundle.entries.push(entry);
  }
  return { bundle, archivedCount };
}

module.exports = { managerToBundle, MANAGER_FORMAT };
