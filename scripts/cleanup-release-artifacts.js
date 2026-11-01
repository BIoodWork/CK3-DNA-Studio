"use strict";

const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "../dist");
const EXACT_FILES_TO_REMOVE = [
  "builder-debug.yml",
  "builder-effective-config.yaml"
];

for (const fileName of EXACT_FILES_TO_REMOVE) {
  const filePath = path.join(DIST_DIR, fileName);
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

if (fs.existsSync(DIST_DIR)) {
  for (const entry of fs.readdirSync(DIST_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".blockmap")) {
      fs.rmSync(path.join(DIST_DIR, entry.name), { force: true });
    }
  }
}
