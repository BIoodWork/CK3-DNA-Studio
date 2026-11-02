const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { studioPayload } = require('../../src/main/studio-input');

test('palette IPC accepts only installed profile selectors and supported color genes', () => {
  for (const profile of ['none', 'epe', 'agot']) {
    for (const gene of ['hair_color', 'skin_color', 'eye_color']) {
      assert.deepEqual(studioPayload('studio_palette', { profile, gene, action: 'game_paste', path: '../outside.dds', width: 999999, text: 'ignored' }), {
        action: 'studio_palette', profile, gene
      });
    }
  }
  for (const value of [null, [], {}, { profile: 'auto', gene: 'hair_color' }, { profile: 'none', gene: 'eye_accessory' },
    { profile: 'none', gene: '../hair_color' }, { profile: 'none', gene: 'hair_color\0' }, { profile: 'none', gene: 'x'.repeat(100000) },
    { profile: {}, gene: 'hair_color' }, { profile: 'epe', gene: ['skin_color'] }]) {
    assert.throws(() => studioPayload('studio_palette', value), /Invalid Studio input/);
  }
});

test('sandboxed preload exposes only the dedicated palette request channel', async () => {
  let desktopApp;
  const calls = [];
  const expected = { available: true, dataUrl: 'data:image/png;base64,example', width: 256, height: 256 };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../src/main/preload.js'), 'utf8'), {
    process: { platform: process.platform },
    require(name) {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld(key, value) { assert.equal(key, 'desktopApp'); desktopApp = value; } },
        ipcRenderer: { invoke: async (...args) => { calls.push(args); return expected; } }
      };
    }
  });
  const payload = { profile: 'none', gene: 'hair_color' };
  assert.equal(await desktopApp.studioPalette(payload), expected);
  assert.deepEqual(calls, [['studio:palette', payload]]);
});
