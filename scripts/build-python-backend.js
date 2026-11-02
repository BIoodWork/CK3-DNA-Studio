"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { findPython } = require("./python-runtime");
const python = findPython(["PyInstaller", "PIL"]);

const PROJECT_DIR = path.resolve(__dirname, "..");
const SPEC_PATH = path.join(PROJECT_DIR, "backend", "python", "bridge.spec");
const DIST_PATH = path.join(PROJECT_DIR, "backend", "runtime", process.platform === "darwin" ? `mac-${process.arch}` : "win-x64");
const WORK_PATH = path.join(PROJECT_DIR, "build", "pyinstaller");
const OUTPUT_EXE = path.join(DIST_PATH, process.platform === "darwin" ? "ck3-dna-bridge" : "ck3-dna-bridge.exe");

const result = spawnSync(
  python.command,
  [
    ...python.args,
    "-m",
    "PyInstaller",
    "--noconfirm",
    "--clean",
    "--distpath",
    DIST_PATH,
    "--workpath",
    WORK_PATH,
    SPEC_PATH
  ],
  {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    windowsHide: true
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(OUTPUT_EXE)) {
  console.error(`Expected backend executable was not created: ${OUTPUT_EXE}`);
  process.exit(1);
}
