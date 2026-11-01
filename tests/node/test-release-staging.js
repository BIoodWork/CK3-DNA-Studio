const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { options, safeCopyTree, runtimeFiles } = require('../../scripts/build-windows');

function temporary(t) {
  const parent = path.resolve(__dirname, 'tests');
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'release-staging-'));
  t.after(() => {
    assert.equal(path.dirname(directory), parent);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test('public build options require explicit paths and never assume personal cache locations', () => {
  assert.deepEqual(options(['--dir', '--skip-backend', '--out', 'public-build']), { directoryOnly: true, skipBackend: true, out: path.resolve('public-build') });
  for (const args of [['--out'], ['--out', '--dir'], ['--force'], ['--out', 'one', 'two']]) assert.throws(() => options(args), /Unknown or incomplete/);
  assert.ok(runtimeFiles.includes('LICENSE'));
  assert.ok(runtimeFiles.includes('LICENSES.chromium.html'));
  assert.equal(runtimeFiles.some(file => /profile|library|default_app/i.test(file)), false);
});

test('release copy excludes bytecode and refuses embedded user libraries/configuration', t => {
  const root = temporary(t), source = path.join(root, 'source'), target = path.join(root, 'target');
  fs.mkdirSync(path.join(source, '__pycache__'), { recursive: true });
  fs.writeFileSync(path.join(source, 'app.js'), 'reviewed source');
  fs.writeFileSync(path.join(source, 'app.pyc'), 'private build path bytecode');
  fs.writeFileSync(path.join(source, '__pycache__/private.pyc'), 'private build path bytecode');
  safeCopyTree(source, target);
  assert.deepEqual(fs.readdirSync(target), ['app.js']);
  for (const filename of ['dna-library.json', 'installation-paths.json', 'ui-language.json', '.env']) {
    const file = path.join(root, filename);
    fs.writeFileSync(file, '{}');
    assert.throws(() => safeCopyTree(file, path.join(root, 'copied')), /user configuration\/library/);
    assert.equal(fs.existsSync(path.join(root, 'copied')), false);
  }
});

test('release copy refuses directory links rather than following files outside the reviewed tree', t => {
  const root = temporary(t), outside = path.join(root, 'outside'), link = path.join(root, 'link');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'private.json'), 'not application source');
  try { fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    t.skip('This environment does not permit creating filesystem links.');
    return;
  }
  assert.throws(() => safeCopyTree(link, path.join(root, 'target')), /symbolic link/);
  assert.equal(fs.existsSync(path.join(root, 'target')), false);
});
