const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

test('built Android page establishes the native bridge before the service worker decision', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts/build-web.cjs')], { cwd: root });
  const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  const bridge = html.match(/<script\b([^>]*)\bsrc="native-bridge\.js"([^>]*)><\/script>/i);
  assert.ok(bridge, 'native bridge is present in the packaged page');
  assert.doesNotMatch(`${bridge[1]} ${bridge[2]}`, /\b(?:defer|async)\b/i);
  assert.ok(bridge.index < html.indexOf("if(!window.SciRunNative?.isNative&&'serviceWorker'"));
  for (const stylesheet of ['concept-screens.css', 'concept-workout.css']) {
    assert.match(html, new RegExp(`href="${stylesheet.replace('.', '\\.')}"`));
    assert.equal(fs.existsSync(path.join(root, 'www', stylesheet)), true, stylesheet);
  }
});

test('native reset cache cleanup removes generated backups and preserves other cache files', async () => {
  const files = new Map([
    ['another-app.json', '{}'],
    ['scirun5k-backup-not-a-generated-timestamp.json', '{}'],
    ['scirun5k-backup-2026-11-06T10-00-00-000Z.txt', '{}'],
  ]);
  const cache = 'CACHE';
  const filesystem = {
    async writeFile({ path: name, data, directory }) {
      assert.equal(directory, cache);
      files.set(name, data);
      return { uri: `file:///cache/${name}` };
    },
    async readdir({ path: directoryPath, directory }) {
      assert.equal(directory, cache);
      assert.equal(directoryPath, '');
      return { files: [...files.keys()].map(name => ({
        name, type: 'file', size: files.get(name).length, mtime: 0, uri: `file:///cache/${name}`,
      })) };
    },
    async deleteFile({ path: name, directory }) {
      assert.equal(directory, cache);
      assert.ok(files.delete(name), `deleted an existing cache file: ${name}`);
    },
  };
  const modules = {
    '@capacitor/core': {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      registerPlugin: name => ({ name }),
    },
    '@capacitor/filesystem': { Directory: { Cache: cache }, Encoding: { UTF8: 'utf8' }, Filesystem: filesystem },
    '@capacitor/haptics': { Haptics: {} },
    '@capacitor/share': { Share: { share: async () => {} } },
  };
  const bundle = esbuild.buildSync({
    entryPoints: [path.join(root, 'src/native-bridge.js')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
  }).outputFiles[0].text;
  const window = {};
  vm.runInNewContext(bundle, {
    window,
    require: name => {
      assert.ok(Object.hasOwn(modules, name), `known Capacitor module: ${name}`);
      return modules[name];
    },
    module: { exports: {} },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-11-06T10:00:00.000Z'])); }
    },
  });
  assert.equal(window.SciRunNative.platform, 'android');
  assert.equal(window.SciRunNative.googleBackup.name, 'GoogleBackup');
  await window.SciRunNative.shareBackup('{"history":[1]}');
  assert.ok(files.has('scirun5k-backup-2026-11-06T10-00-00-000Z.json'));
  await window.SciRunNative.clearBackupCache();
  assert.deepEqual([...files.keys()].sort(), [
    'another-app.json',
    'scirun5k-backup-2026-11-06T10-00-00-000Z.txt',
    'scirun5k-backup-not-a-generated-timestamp.json',
  ]);
});

test('Android backup policy excludes app data from cloud and device transfer', () => {
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const application = manifest.match(/<application\b([^>]+)>/);
  assert.ok(application);
  assert.match(application[1], /android:allowBackup="false"/);
  assert.match(application[1], /android:fullBackupContent="@xml\/full_backup_rules"/);
  assert.match(application[1], /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  const oldRules = fs.readFileSync(path.join(root, 'android/app/src/main/res/xml/full_backup_rules.xml'), 'utf8');
  const newRules = fs.readFileSync(path.join(root, 'android/app/src/main/res/xml/data_extraction_rules.xml'), 'utf8');
  const blocks = [
    oldRules.match(/<full-backup-content>([\s\S]*?)<\/full-backup-content>/)?.[1],
    newRules.match(/<cloud-backup>([\s\S]*?)<\/cloud-backup>/)?.[1],
    newRules.match(/<device-transfer>([\s\S]*?)<\/device-transfer>/)?.[1],
  ];
  for (const [index, block] of blocks.entries()) {
    assert.ok(block, `backup rules section ${index} exists`);
    for (const domain of [
      'root', 'file', 'database', 'sharedpref', 'external',
      'device_root', 'device_file', 'device_database', 'device_sharedpref',
    ]) {
      assert.match(block, new RegExp(`<exclude\\s+domain="${domain}"\\s+path="\\."\\s*/>`));
    }
  }
});

test('Android requires a WebView that supports the packaged color-mix styles', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  assert.ok(config.android.minWebViewVersion >= 111);
  const packagedPath = path.join(root, 'android/app/src/main/assets/capacitor.config.json');
  if (fs.existsSync(packagedPath)) {
    const packagedConfig = JSON.parse(fs.readFileSync(packagedPath, 'utf8'));
    assert.equal(packagedConfig.android.minWebViewVersion, config.android.minWebViewVersion);
  }
});

test('next Android release has an updateable version above the existing 0.1.0 APK', () => {
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  const versionCode = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1]);
  const versionName = gradle.match(/\bversionName\s+"([^"]+)"/)?.[1];
  assert.ok(versionCode > 1);
  assert.notEqual(versionName, '0.1.0');
});
