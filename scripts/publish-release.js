'use strict';
// Runs only in the release workflow with its short-lived repository token.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
async function main() {
 const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
 const repository = process.env.GITHUB_REPOSITORY;
 const token = process.env.GITHUB_TOKEN;
 if (!repository || !token || !process.env.GITHUB_SHA) throw new Error('Run this script inside the authenticated release workflow.');
 const version = pkg.version, tag = 'v' + version;
 const folder = path.resolve('dist');
 const setupName = `${pkg.build.productName} Setup ${version}.exe`;
 const setup = path.join(folder, setupName);
 if (!fs.existsSync(setup)) throw new Error('The expected installer is missing.');
 const checksum = crypto.createHash('sha256').update(fs.readFileSync(setup)).digest('hex');
 const sums = path.join(folder, 'SHA256SUMS.txt');
 fs.writeFileSync(sums, checksum + '  ' + setupName + '\n');
 const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
 async function api(route, options = {}) {
  const response = await fetch('https://api.github.com' + route, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw new Error(`GitHub release request failed (${response.status}).`);
  return response.json();
 }
 const prefix = '/repos/' + repository;
 const existing = await fetch('https://api.github.com' + prefix + '/releases/tags/' + tag, { headers });
 const replace = process.env.STUDIO_REPLACE_103 === 'true';
 if (!replace && existing.status !== 404) throw new Error('A release already exists, or release visibility could not be checked. Existing assets will not be overwritten.');
 const uploadFiles = [setup, sums, path.resolve('CREDITS.md'), path.resolve('THIRD_PARTY_NOTICES.md')];
 for (const file of uploadFiles) if (!fs.statSync(file).isFile()) throw new Error('A required release file is missing.');
 const body = [
  'Edit, convert and manage character DNA for Crusader Kings III.',
  '',
  '- Gene editor for installed Vanilla, EPE and AGOT definitions; automatic profile candidates.',
  '- Local library, original DNA preservation, portraits, import/export and CK3 Gateway.',
  '- Actual game-palette picker, grouped genes, undo/redo and Base64 / Ruler Designer views.',
  '- English by default; German available in Settings.',
  '',
  'Windows x64. Run the Setup executable to install. No separate Python or Node installation is required.',
  'Game/mod definitions are read from your own installation.',
  'CK3 Gateway reads and applies DNA on CK3 1.21.0 (Steam build 26622941), verified in a live Vanilla save. The CK3 1.20.1.2 layout is also supported. Other builds can connect when a known executable layout and the in-game DNA checks match.',
  'No private library, portraits, local settings or personal test data are included.',
  'The installer is unsigned. SHA256SUMS.txt is attached.',
  '',
  'Credits and third-party license notices are included in the repository and installed application.',
 ].join('\n');
 if (replace) {
  if (repository !== 'BIoodWork/CK3-DNA-Studio' || tag !== 'v1.0.3' || !existing.ok) {
   throw new Error('The targeted v1.0.3 release is unavailable.');
  }
  await replace103({ api, prefix, release: await existing.json(), setup, checksum, body, headers });
  return;
 }
 const release = await api(prefix + '/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: process.env.STUDIO_RELEASE_COMMIT || process.env.GITHUB_SHA, name: pkg.build.productName + ' ' + version, body, draft: true, prerelease: false }) });
 for (const file of uploadFiles) {
  const bytes = fs.readFileSync(file), name = path.basename(file);
  const response = await fetch(release.upload_url.replace(/\{.*$/, '') + '?name=' + encodeURIComponent(name), { method: 'POST', headers: { ...headers, 'Content-Type': name.endsWith('.exe') ? 'application/octet-stream' : 'text/plain; charset=utf-8', 'Content-Length': String(bytes.length) }, body: bytes });
  if (!response.ok) throw new Error(`Release upload failed (${response.status}); draft retained for inspection.`);
  const asset = await response.json();
  if (asset.size !== bytes.length) throw new Error('Uploaded asset length differs; draft retained.');
  if (asset.digest !== 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex')) throw new Error('Uploaded asset checksum differs; draft retained.');
  if (file === setup) {
   const publishedName = asset.name || setupName;
   if (/[\r\n\\/]/.test(publishedName)) throw new Error('Unexpected published installer filename.');
   fs.writeFileSync(sums, checksum + '  ' + publishedName + '\n');
  }
 }
 const published = await api(prefix + '/releases/' + release.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false }) });
 console.log('Published ' + published.html_url);
}
async function replace103({ api, prefix, release, setup, checksum, body, headers }) {
 const originalCommit = 'ce2ccacb44e1afda38b87a1c27eadd227fae2427';
 const targetCommit = process.env.STUDIO_RELEASE_COMMIT || process.env.GITHUB_SHA;
 const tagRoute = prefix + '/git/refs/tags/v1.0.3';
 const tagInfo = await api(tagRoute);
 if (release.draft || release.prerelease || release.immutable || tagInfo.object.sha !== originalCommit) {
  throw new Error('The existing release or source tag changed. Replacement cancelled.');
 }
 const installerName = 'Crusader.Kings.III.DNA.Studio.Setup.1.0.3.exe';
 const checksumName = 'SHA256SUMS.txt';
 const installers = release.assets.filter(asset => asset.name === installerName && asset.id === 760377454);
 const checksums = release.assets.filter(asset => asset.name === checksumName && asset.id === 760377635);
 if (installers.length !== 1 || checksums.length !== 1) throw new Error('Original release assets changed.');
 const suffix = '-' + targetCommit.slice(0, 12);
 const staged = [];
 const renamed = [];
 const releaseRoute = prefix + '/releases/' + release.id;
 const patchOptions = data => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
 const rename = (asset, name) => api(prefix + '/releases/assets/' + asset.id, patchOptions({ name }));
 const remove = async asset => {
  const response = await fetch('https://api.github.com' + prefix + '/releases/assets/' + asset.id, { method: 'DELETE', headers });
  if (!response.ok) throw new Error('Cannot remove a superseded asset: ' + response.status);
 };
 async function stage(name, bytes) {
  const endpoint = release.upload_url.replace(/\{.*$/, '') + '?name=' + encodeURIComponent(name);
  const response = await fetch(endpoint, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: bytes });
  if (!response.ok) throw new Error('Replacement upload failed: ' + response.status);
  const asset = await response.json();
  staged.push(asset);
  const digest = 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
  if (asset.name !== name || asset.size !== bytes.length || asset.digest !== digest) {
   throw new Error('Replacement asset did not match the local build.');
  }
  return asset;
 }
 let bodyUpdated = false;
 try {
  const installer = await stage('installer-staged' + suffix + '.exe', fs.readFileSync(setup));
  const sums = await stage('checksums-staged' + suffix + '.txt', Buffer.from(checksum + '  ' + installerName + '\n'));
  for (const asset of [installers[0], checksums[0]]) {
   await rename(asset, 'superseded-' + asset.name);
   renamed.push(asset);
  }
  await rename(installer, installerName);
  await rename(sums, checksumName);
  const updated = await api(releaseRoute, patchOptions({ body }));
  bodyUpdated = true;
  for (const [name, asset] of [[installerName, installer], [checksumName, sums]]) {
   if (!updated.assets.some(item => item.name === name && item.id === asset.id && item.digest === asset.digest)) {
    throw new Error('Replacement asset failed final verification.');
   }
  }
  await api(tagRoute, patchOptions({ sha: targetCommit, force: true }));
 } catch (error) {
  const results = await Promise.allSettled(staged.map(remove));
  for (const asset of renamed) await rename(asset, asset.name);
  if (bodyUpdated) await api(releaseRoute, patchOptions({ body: release.body }));
  if (results.some(result => result.status === 'rejected')) {
   throw new Error('Release replacement failed and a staged asset needs review.', { cause: error });
  }
  throw error;
 }
 for (const asset of renamed) await remove(asset);
 console.log('Replaced verified v1.0.3 assets at ' + release.html_url);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
