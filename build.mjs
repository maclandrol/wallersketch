import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';

const production = process.argv.includes('--production');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({
  entryPoints: { app: 'src/app.ts', 'drape.worker': 'src/render/drape.worker.ts' },
  bundle: true, format: 'esm', outdir: 'dist', target: 'chrome130',
  // Rarely used importers (CAD, OBJ, FBX…) load on demand as separate chunks.
  splitting: true, chunkNames: 'chunks/[name]-[hash]',
  sourcemap: production ? false : 'linked', minify: production, legalComments: 'none',
});
await Promise.all([
  ...['index.html', 'style.css'].map(f => copyFile('src/' + f, 'dist/' + f)),
  copyFile('resources/icon-square.png', 'dist/icon.png'),
]);
