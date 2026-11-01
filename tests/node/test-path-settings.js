const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {PathSettings}=require('../../src/main/path-settings');
const {LanguageSettings}=require('../../src/main/language-settings');
test('settings recover from all non-object JSON values and bad schemas',async t=>{
 const root=await fs.mkdtemp(path.join(__dirname,'settings-regression-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'ui-language.json');
 for(const value of [null,[],false,7,'de',{}, {language:'fr'}]){await fs.writeFile(file,JSON.stringify(value));const s=new LanguageSettings(file);assert.equal(await s.load(),'en');assert(s.warning);}
 const s=new LanguageSettings(file);await s.load();await s.set('de');assert.equal(s.warning,null);assert.equal(await new LanguageSettings(file).load(),'de');
});
test('installation roots validate definitions, serialize changes and survive restart',async t=>{
 const root=await fs.mkdtemp(path.join(__dirname,'paths-regression-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'paths.json');const s=new PathSettings(file);
 assert.deepEqual(await s.load(),{game:'',epe:'',agot:''});await fs.mkdir(path.join(root,'game/common/genes'),{recursive:true});await fs.writeFile(path.join(root,'game/common/genes/genes.txt'),'genes = {}');
 const normalized=await s.normalize('game',root);assert.equal(normalized,path.join(root,'game'));await assert.rejects(s.normalize('agot',root));await s.save({game:normalized,epe:'',agot:''});assert.equal((await new PathSettings(file).load()).game,normalized);
 await fs.writeFile(file,'null');const corrupt=new PathSettings(file);assert.deepEqual(await corrupt.load(),{game:'',epe:'',agot:''});assert(corrupt.warning);
});
