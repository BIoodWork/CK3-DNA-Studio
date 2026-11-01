"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const project = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
if (args.some(arg => !["--node", "--python"].includes(arg)) || (args.includes("--node") && args.includes("--python"))) {
  console.error("Usage: node scripts/test.js [--node | --python]");
  process.exit(2);
}
const runNode = !args.includes("--python");
const runPython = !args.includes("--node");
for (const directory of ["tests/node/tests", "tests/python/tmp"]) fs.mkdirSync(path.join(project, directory), { recursive: true });

function run(command, arguments_, label) {
  console.log(`\n${label}`);
  const result = spawnSync(command, arguments_, { cwd: project, stdio: "inherit", windowsHide: true });
  if (result.error) console.error(`${label} could not start: ${result.error.message}`);
  return result.status === 0 && !result.error;
}

function pythonInterpreter() {
  const candidates = [];
  if (process.env.CK3_CONVERTER_PYTHON) candidates.push({ command: process.env.CK3_CONVERTER_PYTHON, args: [], explicit: true });
  else {
    candidates.push({ command: "python", args: [] }, { command: "py", args: ["-3"] });
    const localDirectories = new Set([process.env.LOCALAPPDATA, process.platform === "win32" ? path.join(os.homedir(), "AppData", "Local") : null].filter(Boolean));
    for (const localAppData of localDirectories) {
      const directory = path.join(localAppData, "Python");
      if (fs.existsSync(directory)) {
        for (const name of fs.readdirSync(directory).filter(name => /^pythoncore-/i.test(name)).sort().reverse()) {
          candidates.push({ command: path.join(directory, name, "python.exe"), args: [] });
        }
      }
    }
  }
  const failures = [];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, "-c", "import sys; assert sys.version_info >= (3, 10), 'Python 3.10+ is required'; import PIL"], {
      cwd: project, encoding: "utf8", timeout: 10000, windowsHide: true
    });
    if (result.status === 0 && !result.error) return candidate;
    failures.push(`${candidate.command}: ${result.error?.message || result.stderr?.trim() || `exit ${result.status}`}`);
  }
  console.error("Python tests require Python 3.10+ with the project's existing Pillow dependency. Set CK3_CONVERTER_PYTHON to its executable path. No dependencies were installed.");
  for (const failure of failures) console.error(failure);
  return null;
}

let passed = true;
if (runNode) {
  const tests = fs.readdirSync(path.join(project, "tests/node")).filter(name => /^test-.*\.js$/.test(name)).sort().map(name => path.join("tests/node", name));
  passed = run(process.execPath, ["--test", "--test-concurrency=1", ...tests], "Node regression tests") && passed;
}
if (runPython) {
  const python = pythonInterpreter();
  if (!python) passed = false;
  else passed = run(python.command, [...python.args, "-m", "unittest", "discover", "-s", "tests/python", "-p", "test_*.py", "-v"], "Python regression tests (installed CK3/EPE/AGOT definitions required for current conversion)") && passed;
}
process.exitCode = passed ? 0 : 1;
