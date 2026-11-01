const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
function setup() {
 const worker = new EventEmitter(); worker.stdout = new EventEmitter(); worker.stderr = new EventEmitter(); worker.stdin = new EventEmitter();
 worker.stdout.setEncoding = worker.stderr.setEncoding = () => {}; worker.lines = []; worker.killed = false;
 worker.stdin.write = (s, _encoding, cb) => { worker.lines.push(JSON.parse(s)); cb?.(); }; worker.stdin.end = () => {};
 worker.kill = () => { worker.killed = true; queueMicrotask(() => worker.emit('close')); };
 const timers = [], context = { require: n => n === 'electron' ? { app: { isPackaged: true } } : n === 'child_process' ? { spawn: () => worker } : require(n), module: { exports: {} }, process: { resourcesPath: 'test', env: {} }, __dirname, setTimeout: cb => { timers.push(cb); return timers.length; }, clearTimeout() {}, Date, Promise, Map, Set, JSON, Error };
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../src/main/python-bridge.js'), 'utf8'), context);
 return { api: context.module.exports, worker, timers };
}
test('path restart refuses pending work and can stop an idle backend', async () => {
 const { api, worker } = setup(), job = api.runPythonBridge({ action: 'schemas' });
 await assert.rejects(api.restartPythonBridge()); assert.equal(worker.killed, false);
 worker.stdout.emit('data', JSON.stringify({ requestId: 1, ok: true, analysis: {} }) + '\n'); await job;
 await api.restartPythonBridge(); assert.equal(worker.killed, true);
});
test('timed-out accepted game writes still block a path restart until completed', async () => {
 const { api, worker, timers } = setup(), job = api.runPythonBridge({ action: 'game_paste' }).catch(() => {});
 timers[0](); await job; await assert.rejects(api.restartPythonBridge()); assert.equal(worker.killed, false);
 worker.stdout.emit('data', JSON.stringify({ requestId: 1, ok: true, analysis: {} }) + '\n'); await api.restartPythonBridge(); assert.equal(worker.killed, true);
});
