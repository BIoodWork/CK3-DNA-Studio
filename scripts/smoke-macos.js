'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
(async()=>{
 const { _electron }=require('playwright');
 const folder=process.arch==='arm64'?'mac-arm64':'mac';const bundle=path.resolve('dist',folder,'Crusader Kings III DNA Studio.app');
 const executable=path.join(bundle,'Contents/MacOS/Crusader Kings III DNA Studio');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ck3-studio-smoke-'));
 const fixtures=JSON.parse(execFileSync(process.env.CK3_CONVERTER_PYTHON||'python',['tests/python/test_macos.py','--fixtures',tmp],{encoding:'utf8'}));
 const env={...process.env,...fixtures.env,CK3_STUDIO_TEST_USER_DATA:path.join(tmp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
 const backend=path.join(bundle,'Contents/Resources/backend/runtime/ck3-dna-bridge');
 const reply=JSON.parse(execFileSync(backend,[],{env,input:JSON.stringify({action:'studio_detect',text:fixtures.dna,profile:'none'}),encoding:'utf8'}));assert(reply.ok);assert.equal(reply.analysis.status,'ready');
 for(let pass=0;pass<2;pass++){
  const app=await _electron.launch({executablePath:executable,env});
  try{
   const page=await app.firstWindow();await page.locator('#librarySearch').waitFor();
   assert.equal(await page.evaluate(()=>window.desktopApp.platform),'darwin');
   if(pass===0){
    await page.evaluate(dna=>window.desktopApp.copyText(dna),fixtures.dna);
    await page.locator('[data-action="new"]').first().click();
    await page.locator('#newDnaText').focus();await page.keyboard.press('Meta+V');
    assert.equal(await page.locator('#newDnaText').inputValue(),fixtures.dna);
    await page.keyboard.press('Escape');
    const result=await page.evaluate(async dna=>{const api=window.desktopApp;const d=await api.studioDetect({text:dna,profile:'none'});const saved=await api.librarySave({name:'Synthetic macOS smoke',note:'',dna,originalDna:dna,sex:'female',format:'encoded',profile:'none',sourceProfile:'none',schemaInfo:d.schemaInfo,lossReport:[],thumbnail:null});return {saved:!!saved.id,status:d.status};},fixtures.dna);
    assert(result.saved);assert.equal(result.status,'ready');
   }else{
    await page.locator('.character-tile').first().waitFor();assert.equal(await page.locator('.character-tile').count(),1);
    await page.locator('[data-page="connection"]').click();assert((await page.locator('#main').textContent()).includes('not available'));
    assert.equal(await page.locator('[data-action="apply-prepared"]').count(),0);
   }
   assert.deepEqual(await page.evaluate(async()=>{const r=await window.desktopApp.gameStatus();return {ready:r.ready,unsupported:r.platformUnsupported};}),{ready:false,unsupported:true});
  }finally{await app.close();}
 }
 console.log('Packaged macOS app: bundled native backend, synthetic DNA detection, library save/restart, and disabled Gateway passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
