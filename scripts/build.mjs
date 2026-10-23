// Bundles the three renderer pages (Billy, the card, the room) into dist/.
import { build } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('dist', { recursive: true })
await build({
  entryPoints: { billy: 'src/renderer/billy.jsx', card: 'src/renderer/card.jsx', room: 'src/renderer/room.jsx' },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  jsx: 'automatic',
  minify: !process.env.BILLY_DEV,
  sourcemap: !!process.env.BILLY_DEV,
  define: { 'process.env.NODE_ENV': process.env.BILLY_DEV ? '"development"' : '"production"' },
  logLevel: 'warning',
})
for (const f of ['billy.html', 'card.html', 'room.html', 'theme.css', 'tray.png']) {
  try { cpSync(`src/renderer/${f}`, `dist/${f}`) } catch {}
}
console.log('built dist/')
