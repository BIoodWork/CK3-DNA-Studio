const { app } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
let child = null;
let nextId = 1;
const pending = new Map();
const writeRequests = new Set();
let output = "";
let lastError = "";
let stopping = false;
let restarting = false;
function failPending(error) {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
  pending.clear();
}
function startBackend() {
  if (stopping) throw new Error("Die App wird beendet.");
  if (restarting) throw new Error("The installation paths are being updated. Please try again shortly.");
  if (child) return child;
  const executable = app.isPackaged ? path.join(process.resourcesPath, "backend/runtime/ck3-dna-bridge.exe")
    : (process.env.CK3_CONVERTER_PYTHON || "python");
  const args = app.isPackaged ? ["--server"] : [path.resolve(__dirname, "../../backend/python/bridge.py"), "--server"];
  const instance = spawn(executable, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  child = instance; output = ""; lastError = "";
  instance.stdout.setEncoding("utf8"); instance.stderr.setEncoding("utf8");
  instance.stdout.on("data", chunk => {
    if (child !== instance) return;
    output += chunk;
    if (output.length > 8000000) { stopPythonBridge(); return; }
    let index;
    while ((index = output.indexOf("\n")) !== -1) {
      const line = output.slice(0, index); output = output.slice(index + 1);
      if (!line.trim()) continue;
      let response;
      try { response = JSON.parse(line); }
      catch { failPending(new Error("Die lokale Verarbeitung hat ungueltig geantwortet.")); continue; }
      writeRequests.delete(response.requestId);
      const item = pending.get(response.requestId);
      if (!item) continue;
      pending.delete(response.requestId); clearTimeout(item.timer);
      if (response.ok) item.resolve(response.analysis);
      else item.reject(new Error(response.error || "Lokale Verarbeitung fehlgeschlagen."));
    }
  });
  instance.stderr.on("data", chunk => { lastError = (lastError + chunk).slice(-4000); });
  instance.on("error", error => { if (child === instance) { child = null; writeRequests.clear(); failPending(error); } });
  instance.on("close", () => {
    if (child === instance) { child = null; writeRequests.clear(); failPending(new Error(lastError || "Die lokale Verarbeitung wurde beendet.")); }
  });
  instance.stdin.on("error", () => {});
  return instance;
}
function runPythonBridge(payload) {
  return new Promise((resolve, reject) => {
    const requestId = nextId++;
    const frame = JSON.stringify({ requestId, payload: { ...payload, deadline: Date.now() + 55000 } });
    if (frame.length > 1900000) { reject(new Error("DNA-Eingabe ist zu gross.")); return; }
    const instance = startBackend();
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("Die lokale Verarbeitung antwortet nicht. App erneut oeffnen."));
    }, 60000);
    pending.set(requestId, { resolve, reject, timer });
    if (["game_paste", "library_apply"].includes(payload.action)) writeRequests.add(requestId);
    instance.stdin.write(frame + "\n", "utf8", error => {
      if (!error) return;
      writeRequests.delete(requestId);
      const item = pending.get(requestId);
      if (item) { pending.delete(requestId); clearTimeout(item.timer); item.reject(error); }
    });
  });
}
function stopPythonBridge() {
  stopping = true;
  const instance = child;
  if (!instance) return Promise.resolve();
  return new Promise(resolve => {
    instance.once("close", resolve);
    instance.stdin.end();
    // Never kill a process with an accepted paste: finish write/readback/rollback first.
    if (writeRequests.size === 0) instance.kill();
  });
}
async function restartPythonBridge() {
  if (stopping || restarting || pending.size || writeRequests.size) throw new Error("Please wait for the current operation to finish before changing installation paths.");
  const instance = child;
  if (!instance) return;
  restarting = true; child = null;
  try { await new Promise(resolve => { instance.once('close', resolve); instance.stdin.end(); instance.kill(); }); }
  finally { restarting = false; }
}
module.exports = { runPythonBridge, stopPythonBridge, restartPythonBridge };
