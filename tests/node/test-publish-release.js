'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const publisher = fs.readFileSync(path.resolve(__dirname, '../../scripts/publish-release.js'), 'utf8');
const entrypoint = /main\(\)\.catch\(error => \{ console\.error\(error\.message\); process\.exitCode = 1; \}\);\s*$/;
const sha256 = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');

// Every file and HTTP response is in memory. Only the source under test is read
// from disk; the real filesystem, network and environment are never exposed.
function runPublisher(settings = {}) {
  assert.match(publisher, entrypoint, 'capture the real asynchronous entrypoint without changing production source');
  const pkg = { version: '1.0.1', build: { productName: 'Synthetic Studio' } };
  const installerName = `${pkg.build.productName} Setup ${pkg.version}.exe`;
  const files = new Map([
    [path.resolve('package.json'), Buffer.from(JSON.stringify(pkg))],
    [path.resolve('dist', installerName), Buffer.from('synthetic installer bytes')],
    [path.resolve('CREDITS.md'), Buffer.from('Synthetic credits: Älva')],
    [path.resolve('THIRD_PARTY_NOTICES.md'), Buffer.from('Synthetic third-party notices')]
  ]);
  if (settings.missingFile) files.delete(path.resolve(settings.missingFile));
  const reads = [], writes = [], calls = [], logs = [];
  const mockFs = {
    readFileSync(file, encoding) {
      reads.push(path.resolve(file));
      const bytes = files.get(path.resolve(file));
      if (!bytes) throw new Error('Synthetic file does not exist.');
      return encoding ? bytes.toString(encoding) : bytes;
    },
    existsSync(file) { return files.has(path.resolve(file)); },
    statSync(file) {
      if (!files.has(path.resolve(file))) throw new Error('Synthetic file does not exist.');
      return { isFile: () => path.basename(file) !== settings.directoryFile };
    },
    writeFileSync(file, bytes) {
      writes.push(path.resolve(file));
      files.set(path.resolve(file), Buffer.from(bytes));
    }
  };
  const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
  const fetch = async (url, options = {}) => {
    const call = { url, method: options.method || 'GET', options };
    calls.push(call);
    if (url === 'https://api.github.com/repos/example/studio/releases/tags/v1.0.1') return response({}, settings.existingStatus ?? 404);
    if (url === 'https://api.github.com/repos/example/studio/releases' && call.method === 'POST') {
      return response({ id: 42, upload_url: 'https://uploads.github.com/repos/example/studio/releases/42/assets{?name,label}' });
    }
    if (url.startsWith('https://uploads.github.com/repos/example/studio/releases/42/assets?name=')) {
      const number = calls.filter(item => item.url.startsWith('https://uploads.github.com/')).length;
      const asset = { size: options.body.length, digest: sha256(options.body) };
      if (settings.badUpload === number) {
        if (settings.failure === 'missing-digest') delete asset.digest;
        else if (settings.failure === 'null-digest') asset.digest = null;
        else if (settings.failure === 'wrong-digest') asset.digest = 'sha256:' + '0'.repeat(64);
        else if (settings.failure === 'wrong-size') asset.size++;
        else if (settings.failure === 'upload-error') return response({}, 502);
      }
      return response(asset);
    }
    if (url === 'https://api.github.com/repos/example/studio/releases/42' && call.method === 'PATCH') {
      return response({ html_url: 'https://example.invalid/synthetic-release' });
    }
    throw new Error('Unexpected synthetic HTTP request.');
  };
  const context = {
    require(name) {
      const modules = { 'node:fs': mockFs, 'node:path': path, 'node:crypto': crypto };
      assert.ok(Object.hasOwn(modules, name), 'only explicitly mocked dependencies may be loaded');
      return modules[name];
    },
    process: { env: settings.env || { GITHUB_REPOSITORY: 'example/studio', GITHUB_TOKEN: 'synthetic-workflow-token', GITHUB_SHA: 'a'.repeat(40) } },
    fetch,
    console: { log(message) { logs.push(message); } }
  };
  vm.runInNewContext(publisher.replace(entrypoint, 'globalThis.runResult = main();'), context);
  return { result: context.runResult, calls, files, reads, writes, logs, installerName };
}

test('publisher uploads four exact assets into a draft and publishes only after all SHA-256 checks', async () => {
  const run = runPublisher();
  await run.result;
  assert.deepEqual(run.calls.map(call => call.method), ['GET', 'POST', 'POST', 'POST', 'POST', 'POST', 'PATCH']);
  const created = JSON.parse(run.calls[1].options.body);
  assert.deepEqual({ tag: created.tag_name, commit: created.target_commitish, draft: created.draft, prerelease: created.prerelease },
    { tag: 'v1.0.1', commit: 'a'.repeat(40), draft: true, prerelease: false });
  const uploads = run.calls.slice(2, 6);
  assert.deepEqual(uploads.map(call => new URL(call.url).searchParams.get('name')),
    [run.installerName, 'SHA256SUMS.txt', 'CREDITS.md', 'THIRD_PARTY_NOTICES.md']);
  for (const call of uploads) assert.equal(call.options.headers['Content-Length'], String(call.options.body.length));
  const expected = sha256(run.files.get(path.resolve('dist', run.installerName))).slice('sha256:'.length);
  assert.equal(run.files.get(path.resolve('dist/SHA256SUMS.txt')).toString(), `${expected}  ${run.installerName}\n`);
  assert.deepEqual(JSON.parse(run.calls.at(-1).options.body), { draft: false });
  assert.deepEqual(run.logs, ['Published https://example.invalid/synthetic-release']);
});

test('missing, null or incorrect checksums and failed uploads retain the draft without publishing', async () => {
  for (const failure of ['missing-digest', 'null-digest', 'wrong-digest', 'wrong-size', 'upload-error']) {
    // A failure on the last asset must still prevent publishing after earlier
    // successful uploads; the first asset exercises the immediate-stop path.
    for (const badUpload of [1, 4]) {
      const run = runPublisher({ failure, badUpload });
      await assert.rejects(run.result, /checksum differs|length differs|upload failed/);
      assert.equal(run.calls.some(call => call.method === 'PATCH'), false, `${failure}, upload ${badUpload}`);
      assert.equal(run.calls.filter(call => call.url.startsWith('https://uploads.github.com/')).length, badUpload);
      assert.deepEqual(run.logs, []);
    }
  }
});

test('missing documents or non-file release assets fail before creating a GitHub draft', async () => {
  for (const missingFile of ['CREDITS.md', 'THIRD_PARTY_NOTICES.md', 'dist/Synthetic Studio Setup 1.0.1.exe']) {
    const run = runPublisher({ missingFile });
    await assert.rejects(run.result, /does not exist|installer is missing/);
    assert.equal(run.calls.some(call => call.method !== 'GET'), false);
  }
  const directory = runPublisher({ directoryFile: 'CREDITS.md' });
  await assert.rejects(directory.result, /required release file is missing/);
  assert.equal(directory.calls.some(call => call.method !== 'GET'), false);
});

test('existing releases, failed visibility checks and absent workflow credentials never mutate GitHub', async () => {
  for (const existingStatus of [200, 403, 500]) {
    const run = runPublisher({ existingStatus });
    await assert.rejects(run.result, /already exists, or release visibility could not be checked/);
    assert.equal(run.calls.length, 1);
    assert.equal(run.calls[0].method, 'GET');
  }
  const unauthenticated = runPublisher({ env: {} });
  await assert.rejects(unauthenticated.result, /inside the authenticated release workflow/);
  assert.deepEqual(unauthenticated.calls, []);
  assert.deepEqual(unauthenticated.writes, []);
});

test('v1.0.3 replacement keeps the public file names and verifies staged assets before renaming', async () => {
  const prefix = '/repos/BIoodWork/CK3-DNA-Studio';
  const installerName = 'Crusader.Kings.III.DNA.Studio.Setup.1.0.3.exe';
  const oldTag = 'ce2ccacb44e1afda38b87a1c27eadd227fae2427';
  for (const corrupt of [false, true]) {
    const originalAssets = [
      { id: 760377454, name: installerName },
      { id: 760377635, name: 'SHA256SUMS.txt' }
    ];
    const assets = new Map(originalAssets.map(asset => [asset.id, { ...asset }]));
    const release = { id: 42, assets: originalAssets, upload_url: 'https://example.invalid/assets{?name}', body: 'previous' };
    const installer = Buffer.from('prepared Windows installer');
    const checksum = sha256(installer).slice(7);
    const target = 'b'.repeat(40);
    let tag = oldTag;
    let body = release.body;
    let upload = 0;
    const api = async (route, options) => {
      if (route === prefix + '/git/refs/tags/v1.0.3') {
        if (options) tag = JSON.parse(options.body).sha;
        return { object: { sha: tag } };
      }
      if (route === prefix + '/releases/42') {
        body = JSON.parse(options.body).body;
        return { assets: [...assets.values()] };
      }
      const asset = assets.get(Number(route.split('/').at(-1)));
      assert.ok(asset);
      asset.name = JSON.parse(options.body).name;
      return asset;
    };
    const fetch = async (url, options) => {
      if (options.method === 'DELETE') {
        assert.ok(assets.delete(Number(url.split('/').at(-1))));
        return { ok: true };
      }
      const name = new URL(url).searchParams.get('name');
      const id = ++upload;
      if (id === 2) assert.equal(options.body.toString(), checksum + '  ' + installerName + '\n');
      const digest = corrupt && id === 2 ? 'bad-digest' : sha256(options.body);
      const asset = { id, name, digest, size: options.body.length };
      assets.set(id, { ...asset });
      return { ok: true, json: async () => asset };
    };
    const context = {
      args: { api, prefix, release, setup: 'test.exe', checksum, body: 'updated', headers: {} },
      require: name => name === 'node:fs' ? { readFileSync: () => installer } : require(name),
      fetch, Buffer, process: { env: { GITHUB_SHA: target } }, console: { log() {} }
    };
    vm.runInNewContext(publisher.replace(entrypoint, 'globalThis.runResult = replace103(args);'), context);
    if (corrupt) {
      await assert.rejects(context.runResult, /did not match the local build/);
      assert.deepEqual([...assets.values()], originalAssets);
      assert.equal(tag, oldTag);
      assert.equal(body, 'previous');
    } else {
      await context.runResult;
      assert.deepEqual([...assets.values()].map(asset => [asset.id, asset.name]), [[1, installerName], [2, 'SHA256SUMS.txt']]);
      assert.equal(tag, target);
      assert.equal(body, 'updated');
    }
  }
});
