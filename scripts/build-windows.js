"use strict";
// Windows packaging from explicit source/runtime allowlists. No live app profile
// or installed game assets are read. Native resource editing avoids rcedit.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { findPython } = require('./python-runtime');
const project = path.resolve(__dirname, '..');
const runtimeFiles = ['chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'electron.exe', 'ffmpeg.dll', 'icudtl.dat', 'libEGL.dll', 'libGLESv2.dll', 'LICENSE', 'LICENSES.chromium.html', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'version', 'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll'];
const forbiddenNames = new Set(['dna-library.json', 'installation-paths.json', 'ui-language.json', '.env']);

function options(args) {
  const result = { directoryOnly: false, skipBackend: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir') result.directoryOnly = true;
    else if (arg === '--skip-backend') result.skipBackend = true;
    else if (arg === '--help') result.help = true;
    else if (['--out', '--electron-dist', '--node-modules'].includes(arg) && args[i + 1] && !args[i + 1].startsWith('--')) result[arg.slice(2)] = path.resolve(args[++i]);
    else throw new Error(`Unknown or incomplete build option: ${arg}`);
  }
  return result;
}
function safeCopyTree(source, target) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Release source contains a symbolic link.');
  if (forbiddenNames.has(path.basename(source))) throw new Error('Release source contains a user configuration/library file.');
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source).sort()) {
      if (name === '__pycache__' || name.endsWith('.pyc')) continue;
      safeCopyTree(path.join(source, name), path.join(target, name));
    }
  } else if (stat.isFile()) fs.copyFileSync(source, target);
  else throw new Error('Release source contains a non-regular file.');
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: project, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Build command failed: ${result.error?.message || result.status}`);
}
function resolveDependency(name, settings) {
  if (settings['node-modules']) return require.resolve(path.join(settings['node-modules'], name));
  return require.resolve(name, { paths: [project] });
}
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function build(settings) {
  if (process.platform !== 'win32') throw new Error('Windows x64 is required to build the Windows backend and executable resources.');
  const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(project, 'package-lock.json'), 'utf8'));
  if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version) throw new Error('Package and lockfile versions differ.');
  const python = findPython(['PyInstaller', 'PIL', 'pefile']);
  const electronDist = settings['electron-dist'] || path.join(path.dirname(resolveDependency('electron/package.json', settings)), 'dist');
  const runtimeVersion = fs.readFileSync(path.join(electronDist, 'version'), 'utf8').trim();
  if (runtimeVersion !== lock.packages['node_modules/electron'].version) throw new Error('Cached Electron runtime does not match package-lock.json.');
  const output = settings.out || path.join(project, 'dist');
  const unpacked = path.join(output, 'win-unpacked');
  if (fs.existsSync(unpacked)) throw new Error('The unpacked output already exists. Choose a new --out directory to preserve it.');
  if (!settings.skipBackend) run(process.execPath, [path.join(__dirname, 'build-python-backend.js')]);
  const backend = path.join(project, 'backend/runtime/win-x64/ck3-dna-bridge.exe');
  if (!fs.statSync(backend).isFile()) throw new Error('Build the Python backend before packaging.');
  const buildRoot = path.join(project, 'build');
  fs.mkdirSync(buildRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(buildRoot, 'release-'));
  const staging = path.join(temporary, 'app'), runtime = path.join(temporary, 'win-unpacked');
  try {
    fs.mkdirSync(staging);
    fs.mkdirSync(runtime);
    for (const file of runtimeFiles) safeCopyTree(path.join(electronDist, file), path.join(runtime, file === 'LICENSE' ? 'LICENSE.electron.txt' : file));
    fs.mkdirSync(path.join(runtime, 'locales'));
    for (const file of fs.readdirSync(path.join(electronDist, 'locales')).sort()) if (file.endsWith('.pak')) safeCopyTree(path.join(electronDist, 'locales', file), path.join(runtime, 'locales', file));
    for (const folder of ['src', 'assets']) safeCopyTree(path.join(project, folder), path.join(staging, folder));
    const appPackage = Object.fromEntries(['name', 'version', 'description', 'author', 'main'].map(key => [key, pkg[key]]));
    appPackage.private = true;
    fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify(appPackage, null, 2) + '\n');
    fs.mkdirSync(path.join(runtime, 'resources/backend/runtime'), { recursive: true });
    safeCopyTree(backend, path.join(runtime, 'resources/backend/runtime/ck3-dna-bridge.exe'));
    const asar = require(resolveDependency('@electron/asar', settings));
    await asar.createPackage(staging, path.join(runtime, 'resources/app.asar'));
    for (const [source, target] of [['LICENSE', 'LICENSE.studio.txt'], ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'], ['CREDITS.md', 'CREDITS.md'], ['PRIVACY.md', 'PRIVACY.md']]) {
      if (fs.existsSync(path.join(project, source))) safeCopyTree(path.join(project, source), path.join(runtime, target));
    }
    if (fs.existsSync(path.join(project, 'assets/third-party'))) safeCopyTree(path.join(project, 'assets/third-party'), path.join(runtime, 'third-party'));
    const executableName = pkg.build.executableName + '.exe';
    const executable = path.join(runtime, executableName);
    fs.renameSync(path.join(runtime, 'electron.exe'), executable);
    run(python.command, [...python.args, path.join(__dirname, 'patch-windows-resources.py'), '--exe', executable, '--icon', path.join(project, 'assets/icon.ico'), '--name', pkg.build.productName, '--version', pkg.version]);
    fs.mkdirSync(output, { recursive: true });
    // Copying supports separate output volumes and Windows scanners which can
    // temporarily prevent renaming a freshly resource-edited application tree.
    safeCopyTree(runtime, unpacked);
    if (!settings.directoryOnly) {
      const builder = require(resolveDependency('electron-builder', settings));
      const config = structuredClone(pkg.build);
      config.directories.output = output;
      config.win.signAndEditExecutable = false;
      config.electronVersion = runtimeVersion;
      config.npmRebuild = false;
      config.publish = null;
      config.nsis.differentialPackage = false;
      await builder.build({ projectDir: project, prepackaged: unpacked, config, targets: builder.Platform.WINDOWS.createTarget(['nsis'], builder.Arch.x64) });
    }
    const manifest = { version: pkg.version, electronVersion: runtimeVersion,
      appAsarSha256: sha256(path.join(unpacked, 'resources/app.asar')), backendSha256: sha256(backend), iconSha256: sha256(path.join(project, 'assets/icon.ico')),
      packagedFiles: asar.listPackage(path.join(unpacked, 'resources/app.asar')).map(file => file.replaceAll('\\', '/')),
      artifacts: fs.readdirSync(output).filter(name => name.endsWith('.exe')).map(name => ({ name, sha256: sha256(path.join(output, name)) })) };
    fs.writeFileSync(path.join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    for (const file of ['builder-debug.yml', 'builder-effective-config.yaml']) fs.rmSync(path.join(output, file), { force: true });
    console.log(`Windows ${settings.directoryOnly ? 'application' : 'installer'} build complete (${pkg.version}).`);
    return manifest;
  } finally {
    // Only this fresh app-owned temporary staging directory is removed.
    if (path.dirname(temporary) !== buildRoot) throw new Error('Invalid temporary release path.');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (require.main === module) {
  const settings = options(process.argv.slice(2));
  if (settings.help) console.log('node scripts/build-windows.js [--dir] [--skip-backend] [--out DIR] [--electron-dist DIR] [--node-modules DIR]\nDefault: build backend and NSIS x64 installer from locked dependencies. Output must not already contain win-unpacked.');
  else build(settings).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { options, safeCopyTree, runtimeFiles };
