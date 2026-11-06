const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'www');
if (path.dirname(output) !== root || path.basename(output) !== 'www') {
  throw new Error('Unexpected web output directory');
}

const assets = [
  'index.html', 'app.css', 'liquid-glass.css', 'experience.css',
  'theme-graphite.css', 'palette-options.css', 'manifest.json',
  'timer-core.js', 'pending-session-store.js', 'dashboard-metrics.js',
  'workout-view.js', 'state-backup.js', 'experience.js', 'sw.js',
  'icon.svg', 'icon-192.png', 'icon-512.png',
  'fonts/Barlow-Regular.ttf', 'fonts/Barlow-SemiBold.ttf',
  'fonts/Barlow-Bold.ttf', 'fonts/Barlow-Black.ttf',
];

for (const name of assets) {
  if (!fs.statSync(path.join(root, name)).isFile()) throw new Error(`Missing runtime asset: ${name}`);
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of assets) {
  const target = path.join(output, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, name), target);
}

const htmlPath = path.join(output, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('</head>')) throw new Error('Missing HTML head');
fs.writeFileSync(htmlPath, html.replace('</head>', '<script src="native-bridge.js"></script>\n</head>'));
esbuild.buildSync({
  entryPoints: [path.join(root, 'src/native-bridge.js')],
  outfile: path.join(output, 'native-bridge.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
});
console.log(`Bundled ${assets.length + 1} SciRun Android assets in www/`);
