"use strict";

const { LIMITS } = require('./library-store');
const profiles = new Set(['none', 'epe', 'agot']);
function invalid() { throw new Error('Invalid Studio input.'); }
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
}
function text(value, limit = LIMITS.dna) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) invalid();
  return value;
}
function studioPayload(action, value) {
  object(value);
  const result = { action };
  if (!['studio_catalog', 'studio_palette'].includes(action)) result.text = text(value.text);
  if (action === 'studio_detect') {
    if (value.profile !== undefined && value.profile !== 'auto' && !profiles.has(value.profile)) invalid();
    if (value.profile !== undefined) result.profile = value.profile;
    return result;
  }
  if (!profiles.has(value.profile)) invalid();
  result.profile = value.profile;
  if (action === 'studio_catalog') return result;
  if (action === 'studio_palette') {
    if (!['hair_color', 'skin_color', 'eye_color'].includes(value.gene)) invalid();
    result.gene = value.gene;
    return result;
  }
  if (action !== 'studio_encode' || !Array.isArray(value.genes) || value.genes.length > 10000) invalid();
  result.genes = value.genes.map(gene => {
    object(gene);
    const name = text(gene.name, 200);
    // Opaque, read-only genes are represented by null. The backend accepts
    // them only when identical to the source, preserving full UI snapshots.
    if (gene.values === null) return { name, values: null };
    if (!Array.isArray(gene.values) || gene.values.length !== 4) invalid();
    const values = gene.values.map(item => {
      if (typeof item === 'string') return text(item, 200);
      if (typeof item !== 'number' || !Number.isFinite(item) || Math.abs(item) > 65536) invalid();
      return item;
    });
    return { name, values };
  });
  if (value.targetFormat !== undefined) {
    if (!['encoded', 'ruler_designer'].includes(value.targetFormat)) invalid();
    result.targetFormat = value.targetFormat;
  }
  return result;
}

module.exports = { studioPayload };
