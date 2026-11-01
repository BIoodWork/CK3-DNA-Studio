const fs = require('node:fs/promises');
const fsNative = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class LanguageSettings {
  constructor(file) { this.file = file; this.language = 'en'; this.queue = Promise.resolve(); this.warning = null; }
  async load() {
    try {
      const value = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (value && typeof value === 'object' && !Array.isArray(value) && ['de', 'en'].includes(value.language)) this.language = value.language;
      else this.warning = 'The language setting could not be read. English is being used. Choose your language to save a valid setting.';
    } catch (error) { if (error.code !== 'ENOENT') this.warning = 'The language setting could not be read. English is being used. Choose your language to save a valid setting.'; }
    return this.language;
  }
  set(language) {
    if (!['de', 'en'].includes(language)) return Promise.reject(new Error('Unsupported language.'));
    const operation = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify({ language }) + '\n', { flag: 'wx' });
        for (let attempt = 0; ; attempt++) {
          try { fsNative.renameSync(temporary, this.file); break; }
          catch (error) {
            if (attempt >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
            await new Promise(resolve => setTimeout(resolve, 15 * 2 ** attempt));
          }
        }
        this.language = language;
        this.warning = null;
      } finally { await fs.unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
      return language;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
module.exports = { LanguageSettings };
