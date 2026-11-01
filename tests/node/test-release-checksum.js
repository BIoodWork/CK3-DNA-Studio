'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.resolve(__dirname,'../../scripts/repair-release-checksum.js'),'utf8');
async function run(options={}){
 const writes=[],messages=[],state={exitCode:0,env:{GITHUB_REPOSITORY:'BIoodWork/CK3-DNA-Studio',GITHUB_TOKEN:'in-memory-test-token',STUDIO_RELEASE_COMMIT:'public-head'}};
 const installer={id:1,name:'Crusader.Kings.III.DNA.Studio.Setup.1.0.1.exe',digest:'sha256:'+'a'.repeat(64),size:123};
 const bytes=Buffer.from('a'.repeat(64)+'  '+installer.name+'\n');const digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 const release={draft:false,prerelease:false,upload_url:'https://uploads.github.com/test{?name}',assets:[installer,{id:2,name:'SHA256SUMS.txt',digest:options.already?digest:'sha256:'+'b'.repeat(64),size:options.already?bytes.length:5}]};
 if(options.invalidInstaller)installer.digest=null;
 const fetch=async(url,o={})=>{const method=o.method||'GET';if(method!=='GET')writes.push({url,method,body:o.body});let body,status=200;
  if(url.includes('/releases/tags/'))body=release;
  else if(url.includes('/compare/'))body={files:[{filename:options.runtime?'src/renderer/app.js':'scripts/publish-release.js'}]};
  else if(url.startsWith('https://uploads.')){assert.deepEqual(o.body,bytes);body={id:3,name:'SHA256SUMS.pending.txt',size:bytes.length,digest:options.badUpload?'sha256:'+'c'.repeat(64):digest};}
  else if(method==='DELETE'){assert.match(url,/\/releases\/assets\/2$/);status=204;}
  else if(method==='PATCH'){assert.match(url,/\/releases\/assets\/3$/);body={id:3,name:'SHA256SUMS.txt',size:bytes.length,digest};}
  else throw Error('Unexpected request');return {ok:true,status,json:async()=>body};};
 await vm.runInNewContext(source,{require:name=>name==='node:fs'?{readFileSync:()=>JSON.stringify({version:'1.0.1'})}:require(name),Buffer,process:state,fetch,console:{log:m=>messages.push(m),error:m=>messages.push(m)}});
 return {writes,messages,state};
}
test('repairs only checksum after verified staging, never changes installer',async()=>{const r=await run();assert.equal(r.state.exitCode,0);assert.deepEqual(r.writes.map(w=>w.method),['POST','DELETE','PATCH']);assert.match(r.messages.at(-1),/installer asset unchanged/);});
test('matching checksum is idempotent without mutations',async()=>{const r=await run({already:true});assert.equal(r.state.exitCode,0);assert.equal(r.writes.length,0);});
test('runtime changes and unverified installers refuse all writes',async()=>{for(const options of [{runtime:true},{invalidInstaller:true}]){const r=await run(options);assert.equal(r.state.exitCode,1);assert.equal(r.writes.length,0);}});
test('failed staging verification keeps the original checksum and installer',async()=>{const r=await run({badUpload:true});assert.equal(r.state.exitCode,1);assert.deepEqual(r.writes.map(w=>w.method),['POST']);});
