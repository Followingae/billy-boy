// Stress test for the faces fan: Billy at every reachable spot in his window, docked and
// floating, with 1 to 10 faces. Every face must be placed, inside the window, clear of Billy,
// clear of the melt strip and clear of every other face (so the goo never merges them).
// Run: node scripts/stress-fan.mjs
import { createRequire } from 'node:module'
import { fanLayout, meltFor, CLEAR, FIRST_RING, W, ICON } from '../src/renderer/fan.mjs'
const require = createRequire(import.meta.url)
const D = require('../app/dock.js')

const displays = [
  { id: 1, workArea: { x: 0, y: 0, width: 2048, height: 1104 } },
  { id: 2, workArea: { x: 2048, y: 124, width: 1920, height: 1032 } },
  { id: 3, workArea: { x: 0, y: 1104, width: 1280, height: 700 } },
]
let fails = 0, checks = 0
const fail = (m, c) => { fails++; if (fails <= 12) console.log('FAIL', m, JSON.stringify(c)) }
for (let i = 0; i < 6000; i++) {
  const d = displays[i % 3].workArea
  const p = { x: d.x + Math.random() * d.width, y: d.y + Math.random() * d.height }
  const r = D.decide(displays, p)
  const L = D.layout(displays, r.dock, r.center, false)
  const melt = meltFor(r.dock, L.anchor)
  for (let n = 1; n <= 10; n++) {
    const pts = fanLayout(n, L.anchor, r.dock)
    checks++
    if (pts.length !== n) { fail(`placed ${pts.length}/${n}`, { dock: r.dock, anchor: L.anchor }); continue }
    for (const [a, q] of pts.entries()) {
      checks += 3
      if (q.x < ICON / 2 || q.y < ICON / 2 || q.x > W - ICON / 2 || q.y > W - ICON / 2) fail('outside window', { q, anchor: L.anchor })
      if (Math.hypot(q.x - L.anchor.x, q.y - L.anchor.y) < FIRST_RING - 1) fail('on top of Billy', { q, anchor: L.anchor })
      if (melt) {
        const nx = Math.min(Math.max(q.x, melt.x), melt.x + melt.w), ny = Math.min(Math.max(q.y, melt.y), melt.y + melt.h)
        if (Math.hypot(q.x - nx, q.y - ny) < ICON / 2 + 18) fail('touching the melt strip', { q, melt })
      }
      for (const z of pts.slice(a + 1)) if (Math.hypot(z.x - q.x, z.y - q.y) < CLEAR - 1) fail('faces too close', { q, z })
    }
  }
}
console.log(`${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
