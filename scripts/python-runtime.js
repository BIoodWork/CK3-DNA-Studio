"use strict";
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
function findPython(modules = ['PIL']) {
  const candidates = [];
  if (process.env.CK3_CONVERTER_PYTHON) candidates.push({ command: process.env.CK3_CONVERTER_PYTHON, args: [] });
  else {
    for (const local of new Set([process.env.LOCALAPPDATA, process.platform === 'win32' ? path.join(os.homedir(), 'AppData/Local') : null].filter(Boolean))) {
      const folder = path.join(local, 'Python');
      if (fs.existsSync(folder)) for (const name of fs.readdirSync(folder).filter(n => /^pythoncore-/i.test(n)).sort().reverse()) candidates.push({ command: path.join(folder, name, 'python.exe'), args: [] });
    }
    candidates.push({ command: 'python3', args: [] }, { command: 'python', args: [] }, { command: 'py', args: ['-3'] });
  }
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.args, '-c', "import sys; assert sys.version_info >= (3,10); " + modules.map(name => 'import ' + name).join('; ')], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error('Python 3.10+ with ' + modules.join(', ') + ' is required. Set CK3_CONVERTER_PYTHON to the executable path. No dependencies were installed.');
}
module.exports = { findPython };
