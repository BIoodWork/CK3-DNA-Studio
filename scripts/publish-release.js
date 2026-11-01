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
 if (existing.status !== 404) throw new Error('A release already exists, or release visibility could not be checked. Existing assets will not be overwritten.');
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
  'Game/mod definitions are read from your own installation. Direct game access supports the verified CK3 1.20.1.2 build.',
  'No private library, portraits, local settings or personal test data are included.',
  'The installer is unsigned. SHA256SUMS.txt is attached.',
  '',
  'Credits and third-party license notices are included in the repository and installed application.',
 ].join('\n');
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
main().catch(error => { console.error(error.message); process.exitCode = 1; });
