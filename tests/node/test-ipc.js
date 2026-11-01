const fs=require('fs'),vm=require('vm'),assert=require('assert'),{EventEmitter}=require('events');
const code=fs.readFileSync(require('path').resolve(__dirname,'../../src/main/python-bridge.js'),'utf8');
function setup(){
 const worker=new EventEmitter();worker.stdout=new EventEmitter();worker.stdout.setEncoding=()=>{};worker.stderr=new EventEmitter();worker.stderr.setEncoding=()=>{};worker.stdin=new EventEmitter();worker.lines=[];worker.killed=false;
 worker.stdin.write=(s,enc,callback)=>{worker.lines.push(JSON.parse(s));callback?.()};worker.stdin.end=()=>{worker.ended=true};worker.kill=()=>{worker.killed=true;queueMicrotask(()=>worker.emit('close'))};
 const timers=[];const context={require:n=>n==='electron'?{app:{isPackaged:true}}:n==='child_process'?{spawn:()=>worker}:require(n),module:{exports:{}},process:{resourcesPath:'X:/App/resources',env:{}},__dirname:'X:/App/src/main',setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{},Date,Promise,Map,Set,JSON,Error};
 vm.runInNewContext(code,context);return {worker,timers,api:context.module.exports};
}
(async()=>{
 {const {api,worker}=setup();const job=api.runPythonBridge({action:'game_paste'});assert(worker.lines[0].payload.deadline>Date.now());const closing=api.stopPythonBridge();assert(worker.ended);assert(!worker.killed);worker.stdout.emit('data',JSON.stringify({requestId:1,ok:true,analysis:{changed:false}})+'\n');await job;worker.emit('close');await closing;}
 {const {api,worker,timers}=setup();const job=api.runPythonBridge({action:'game_paste'}).catch(e=>e.message);timers[0]();await job;const closing=api.stopPythonBridge();assert(!worker.killed,'Timed out but accepted write must finish safely');worker.stdout.emit('data',JSON.stringify({requestId:1,ok:true,analysis:{}})+'\n');worker.emit('close');await closing;}
 {const {api,worker}=setup();const job=api.runPythonBridge({action:'schemas'}).catch(()=>{});await api.stopPythonBridge();await job;assert(worker.killed);}
 {const {api,worker}=setup();await assert.rejects(api.runPythonBridge({text:'x'.repeat(1900001)}));assert.equal(worker.lines.length,0);}
 console.log('4 IPC lifecycle checks passed: graceful paste shutdown, timed-out write drain, idle shutdown, framed input limit');
})().catch(e=>{console.error(e);process.exitCode=1});
