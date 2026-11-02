'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {findPython}=require('./python-runtime');
async function main(){
 if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Build on a native Apple Silicon or Intel macOS runner.');
 const root=path.resolve(__dirname,'..'),pkg=require('../package.json');
 if(!pkg.version.includes('-alpha.'))throw Error('macOS packages must use an alpha version.');
 const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:root,stdio:'inherit'});if(r.error||r.status!==0)throw Error('Build step failed: '+cmd);};
 const python=findPython(['PIL','PyInstaller']);
 const icon=path.join(root,'assets/icon.icns');
 run(python.command,[...python.args,'-c',"from PIL import Image; Image.open('assets/icon-ui.png').convert('RGBA').save('assets/icon.icns')"]);
 run(process.execPath,['scripts/build-python-backend.js']);
 const backend=path.join(root,`backend/runtime/mac-${process.arch}/ck3-dna-bridge`);
 fs.chmodSync(backend,0o755);
 const {build,Platform,Arch}=require('electron-builder');
 const config=structuredClone(pkg.build);
 config.extraResources=[{from:`backend/runtime/mac-${process.arch}`,to:'backend/runtime',filter:['ck3-dna-bridge']},...['LICENSE','CREDITS.md','PRIVACY.md','THIRD_PARTY_NOTICES.md'].map(name=>({from:name,to:name}))];
 config.artifactName='CK3-DNA-Studio-${version}-macOS-${arch}.${ext}';
 config.mac={category:'public.app-category.utilities',target:['dmg','zip'],icon,identity:'-',hardenedRuntime:false,gatekeeperAssess:false,minimumSystemVersion:'12.0'};
 config.dmg={sign:false};config.publish=null;config.npmRebuild=false;
 await build({targets:Platform.MAC.createTarget(['dmg','zip'],process.arch==='arm64'?Arch.arm64:Arch.x64),config});
}
main().catch(e=>{console.error(e);process.exitCode=1});
