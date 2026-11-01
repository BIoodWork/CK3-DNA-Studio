const fs = require('node:fs/promises');
const fsNative = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const KINDS = ['game', 'epe', 'agot'];
class PathSettings {
  constructor(file) { this.file = file; this.paths = { game: '', epe: '', agot: '' }; this.queue = Promise.resolve(); this.warning = null; }
  async load() {
    try {
      const value = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !KINDS.includes(k))) throw new Error('Invalid paths');
      const loaded = {};
      for (const kind of KINDS) {
        const candidate = value[kind] ?? '';
        if (typeof candidate !== 'string' || (candidate && (!path.isAbsolute(candidate) || candidate.includes('\0')))) throw new Error('Invalid paths');
        loaded[kind] = candidate;
      }
      this.paths = loaded;
    } catch (error) { if (error.code !== 'ENOENT') this.warning = 'The installation path settings could not be read. Automatic discovery is being used. Choose the folders again in Settings.'; }
    return { ...this.paths };
  }
  async normalize(kind, chosen) {
    if (!KINDS.includes(kind) || typeof chosen !== 'string' || !path.isAbsolute(chosen)) throw new Error('Invalid installation folder.');
    const candidates = [path.join(chosen, 'common/genes'), ...(kind === 'game' ? [path.join(chosen, 'game/common/genes')] : [])];
    if (path.basename(chosen).toLowerCase() === 'genes') candidates.push(chosen);
    for (const genes of candidates) {
      try {
        if ((await fs.stat(genes)).isDirectory() && (await fs.readdir(genes)).some(name => name.toLowerCase().endsWith('.txt'))) return path.dirname(path.dirname(path.resolve(genes)));
      } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    }
    throw new Error('The selected folder contains no common/genes definitions. Choose the CK3 game folder or the mod folder.');
  }
  save(paths) {
    const snapshot = { ...paths };
    const operation = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify(snapshot) + '\n', { flag: 'wx' });
        for (let attempt = 0; ; attempt++) {
          try { fsNative.renameSync(temporary, this.file); break; }
          catch (error) { if (attempt >= 5 || !['EPERM','EACCES','EBUSY'].includes(error.code)) throw error; await new Promise(resolve => setTimeout(resolve, 15 * 2 ** attempt)); }
        }
        this.paths = snapshot; this.warning = null;
      } finally { await fs.unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
      return { ...this.paths };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
module.exports = { PathSettings };
