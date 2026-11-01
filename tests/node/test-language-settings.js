const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { LanguageSettings } = require('../../src/main/language-settings');
test('fresh English default, explicit German, serialized changes and restart', async t => {
 const directory = await fs.mkdtemp(path.join(__dirname, 'ck3-language-')); t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const file = path.join(directory,'ui-language.json'), settings = new LanguageSettings(file);
 assert.equal(await settings.load(),'en'); await assert.rejects(fs.stat(file),{code:'ENOENT'});
 await settings.set('de'); assert.equal(await new LanguageSettings(file).load(),'de');
 await Promise.all([settings.set('en'),settings.set('de'),settings.set('en')]); assert.equal(await new LanguageSettings(file).load(),'en');
 const before = await fs.readFile(file,'utf8'); await assert.rejects(settings.set('fr')); assert.equal(await fs.readFile(file,'utf8'),before);
 await fs.writeFile(file,'bad json'); assert.equal(await new LanguageSettings(file).load(),'en');
});
