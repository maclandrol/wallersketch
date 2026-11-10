// Builds the app into dist/ (desktop) or dist-web/ (tablet and browsers, with --web).
import { build } from 'esbuild';
import { mkdir, copyFile, rm, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const production = process.argv.includes('--production') || process.argv.includes('--web');
const web = process.argv.includes('--web');
const out = web ? 'dist-web' : 'dist';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await build({
  entryPoints: { app: 'src/app.ts', 'drape.worker': 'src/render/drape.worker.ts' },
  bundle: true, format: 'esm', outdir: out, target: web ? ['safari16', 'chrome110'] : 'chrome130',
  // Rarely used importers (CAD, OBJ, FBX…) and the AI SDKs load on demand as separate chunks.
  splitting: true, chunkNames: 'chunks/[name]-[hash]',
  sourcemap: production ? false : 'linked', minify: production, legalComments: 'none',
  define: { __VERSION__: JSON.stringify(version) },
});
await copyFile('src/style.css', path.join(out, 'style.css'));
await copyFile('resources/icon-square.png', path.join(out, 'icon.png'));

if (!web) {
  await copyFile('src/index.html', path.join(out, 'index.html'));
} else {
  // Installable web app: home-screen icon, full screen, offline after the first visit.
  for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) await copyFile('resources/web/' + f, path.join(out, f));
  await writeFile(path.join(out, 'manifest.webmanifest'), JSON.stringify({
    name: 'WallerSketch', short_name: 'WallerSketch', lang: 'fr', start_url: './', scope: './', display: 'standalone', orientation: 'any',
    background_color: '#f4f2ee', theme_color: '#fbfaf8', description: 'Compositions de tables cocktail en 3D',
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
  }));
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob: https://api.anthropic.com https://api.openai.com https://api.deepseek.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'";
  const html = (await readFile('src/index.html', 'utf8'))
    .replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">')
    .replace('<link rel="stylesheet" href="style.css">', `<meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="theme-color" content="#fbfaf8">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="WallerSketch">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="stylesheet" href="style.css">`);
  await writeFile(path.join(out, 'index.html'), html);
  // Service worker: precache every built file under a content hash, so updates replace the cache.
  const files = [];
  const walk = async dir => { for (const f of await readdir(dir)) { const p = path.join(dir, f); (await stat(p)).isDirectory() ? await walk(p) : files.push(p); } };
  await walk(out);
  const hash = createHash('sha256');
  for (const f of files.sort()) hash.update(f).update(await readFile(f));
  const list = ['./', ...files.map(f => './' + path.relative(out, f).split(path.sep).join('/'))];
  await writeFile(path.join(out, 'sw.js'), `const CACHE = 'wallersketch-${hash.digest('hex').slice(0, 12)}';
const FILES = ${JSON.stringify(list)};
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
`);
}
