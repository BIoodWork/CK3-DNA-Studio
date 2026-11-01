'use strict';
const fs = require('node:fs'), crypto = require('node:crypto');
async function repair() {
 const {version} = JSON.parse(fs.readFileSync('package.json','utf8'));
 const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN,head=process.env.STUDIO_RELEASE_COMMIT;
 if(repo!=='BIoodWork/CK3-DNA-Studio'||!token||!head)throw Error('Run inside the authenticated Studio maintenance workflow.');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const base='https://api.github.com/repos/'+repo;
 async function api(route,options={}){const r=await fetch(base+route,{...options,headers:{...headers,...options.headers}});if(!r.ok)throw Error('GitHub maintenance request failed ('+r.status+').');return r.status===204?null:r.json();}
 const release=await api('/releases/tags/v'+version);
 if(release.draft||release.prerelease)throw Error('Expected a published stable release.');
 const comparison=await api('/compare/v'+version+'...'+head);
 const allowed=new Set(['.github/workflows/release.yml','.github/workflows/repair-checksum.yml','scripts/repair-release-checksum.js','scripts/publish-release.js','scripts/prepare-public-identity.ps1','tests/node/test-release-checksum.js']);
 if(comparison.files?.some(f=>!allowed.has(f.filename))||!Array.isArray(comparison.files)||comparison.files.length>=300)throw Error('Application source changed: bump the version instead of repairing an existing release.');
 const setups=release.assets.filter(a=>a.name.endsWith('.exe'));
 if(setups.length!==1||!/^sha256:[a-f0-9]{64}$/.test(setups[0].digest||'')||/[\r\n\\/]/.test(setups[0].name))throw Error('Installer asset cannot be verified.');
 const text=setups[0].digest.slice(7)+'  '+setups[0].name+'\n',bytes=Buffer.from(text);
 const digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 const previous=release.assets.find(a=>a.name==='SHA256SUMS.txt');
 if(previous?.digest===digest&&previous.size===bytes.length){console.log('Published checksum already matches the installer filename.');return;}
 let pending=release.assets.find(a=>a.name==='SHA256SUMS.pending.txt');
 if(pending&&(pending.digest!==digest||pending.size!==bytes.length))throw Error('Unexpected pending checksum; existing files were preserved.');
 if(!pending){const response=await fetch(release.upload_url.replace(/\{.*$/,'')+'?name=SHA256SUMS.pending.txt',{method:'POST',headers:{...headers,'Content-Type':'text/plain; charset=utf-8','Content-Length':String(bytes.length)},body:bytes});if(!response.ok)throw Error('Checksum upload failed; previous checksum preserved.');pending=await response.json();}
 if(pending.digest!==digest||pending.size!==bytes.length)throw Error('Checksum upload verification failed; previous checksum preserved.');
 if(previous)await api('/releases/assets/'+previous.id,{method:'DELETE'});
 const result=await api('/releases/assets/'+pending.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'SHA256SUMS.txt'})});
 if(result.digest!==digest||result.name!=='SHA256SUMS.txt')throw Error('Final checksum metadata differs.');
 console.log('Checksum filename corrected; installer asset unchanged.');
}
repair().catch(e=>{console.error(e.message);process.exitCode=1;});
