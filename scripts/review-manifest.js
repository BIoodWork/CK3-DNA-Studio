"use strict";
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const project = path.resolve(__dirname, '..');
const args = process.argv.slice(2), options = {};
for (let i=0;i<args.length;i+=2) { if (!['--asar','--installer','--out'].includes(args[i]) || !args[i+1]) throw new Error('Usage: node scripts/review-manifest.js --asar <app.asar> [--installer <installer.exe>] [--out <manifest.json>]'); options[args[i]]=path.resolve(args[i+1]); }
if (!options['--asar']) throw new Error('Specify the reviewed app.asar using --asar. No installer is built by this command.');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = {};
function walk(folder) {
 for (const entry of fs.readdirSync(folder, { withFileTypes:true }).sort((a,b)=>a.name.localeCompare(b.name))) {
  if (['__pycache__','node_modules','tmp'].includes(entry.name) || entry.name.endsWith('.pyc') || (entry.name==='tests' && path.basename(folder)==='node')) continue;
  const file = path.join(folder,entry.name);
  if (entry.isDirectory()) walk(file); else if (entry.isFile()) source[path.relative(project,file).replaceAll('\\','/')]=sha(file);
 }
}
for (const folder of ['src','assets','backend/python','scripts','tests']) walk(path.join(project,folder));
for (const file of ['package.json','package-lock.json']) source[file]=sha(path.join(project,file));
const manifest={version:JSON.parse(fs.readFileSync(path.join(project,'package.json'),'utf8')).version,createdAt:new Date().toISOString(),installerDeferred:!options['--installer'],source,artifacts:{appAsar:sha(options['--asar']),backend:sha(path.join(project,'backend/runtime/win-x64/ck3-dna-bridge.exe')),...(options['--installer']?{installer:sha(options['--installer'])}:{})}};
const output=options['--out'] || path.join(project,'build/review-manifest.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');console.log('Review manifest:',output);
