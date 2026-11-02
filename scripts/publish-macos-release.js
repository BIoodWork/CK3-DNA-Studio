'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const {version}=require('../package.json'),repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN,commit=process.env.STUDIO_RELEASE_COMMIT||process.env.GITHUB_SHA;
 if(!repo||!token||!commit||!/^\d+\.\d+\.\d+-alpha\.\d+$/.test(version))throw Error('Authenticated alpha workflow required.');
 const tag='macos-v'+version,prefix='/repos/'+repo;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const request=async(route,options={})=>{const r=await fetch('https://api.github.com'+route,{...options,headers:{...headers,...options.headers}});if(!r.ok)throw Error('Release request failed: '+r.status);return r.json();};
 const check=await fetch('https://api.github.com'+prefix+'/releases/tags/'+tag,{headers});if(check.status!==404)throw Error('Release already exists or cannot be checked; existing assets will not be replaced.');
 const files=['arm64','x64'].flatMap(arch=>['dmg','zip'].map(ext=>path.resolve('dist',`CK3-DNA-Studio-${version}-macOS-${arch}.${ext}`)));
 for(const f of files)if(!fs.statSync(f).isFile())throw Error('Missing native package: '+path.basename(f));
 const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 const sum=path.resolve('dist/SHA256SUMS-macOS.txt');fs.writeFileSync(sum,files.map(f=>digest(f)+'  '+path.basename(f)).join('\n')+'\n');
 files.push(sum,path.resolve('CREDITS.md'),path.resolve('THIRD_PARTY_NOTICES.md'),path.resolve('MACOS_ALPHA.md'));
 const body=fs.readFileSync('MACOS_ALPHA.md','utf8');
 const release=await request(prefix+'/releases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:commit,name:'Crusader Kings III DNA Studio '+version+' — macOS Alpha',body,draft:true,prerelease:true,make_latest:'false'})});
 for(const f of files){const bytes=fs.readFileSync(f);const r=await fetch(release.upload_url.replace(/\{.*$/,'')+'?name='+encodeURIComponent(path.basename(f)),{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:bytes});if(!r.ok)throw Error('Asset upload failed: '+r.status+'; draft retained.');const asset=await r.json();if(asset.size!==bytes.length||asset.name!==path.basename(f)||asset.digest!=='sha256:'+digest(f))throw Error('Asset verification failed; draft retained.');}
 const result=await request(prefix+'/releases/'+release.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:false,make_latest:'false'})});console.log('Published '+result.html_url);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});

