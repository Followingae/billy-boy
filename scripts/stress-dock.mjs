// Stress test for Billy's docking: thousands of random drags, drops and flicks over several
// monitor layouts (side by side, offset heights, stacked, mixed sizes, a tall taskbar). Every
// result must leave Billy wholly on one screen, his window wholly on that same screen, and a
// dock only when he was actually near that edge.   Run: node scripts/stress-dock.mjs
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const D = require('../app/dock.js')

const area = (x, y, width, height) => ({ x, y, width, height })
const LAYOUTS = {
  'three across, offset (the author\'s desk)': [
    { id: 1, workArea: area(0, 0, 2048, 1104) },
    { id: 2, workArea: area(2048, 124, 1920, 1032) },
    { id: 3, workArea: area(-1920, 131, 1920, 1032) },
  ],
  'one laptop': [{ id: 1, workArea: area(0, 0, 1280, 752) }],
  'stacked': [{ id: 1, workArea: area(0, 0, 1920, 1040) }, { id: 2, workArea: area(0, -1080, 1920, 1080) }],
  'big and small, gap below': [{ id: 1, workArea: area(0, 0, 3840, 2100) }, { id: 2, workArea: area(3840, 0, 1366, 728) }],
  'taskbar on the left': [{ id: 1, workArea: area(62, 0, 1858, 1080) }],
}

let failures = 0, checks = 0
const fail = (msg, ctx) => { failures++; if (failures <= 15) console.log('FAIL', msg, JSON.stringify(ctx)) }
const within = (wa, r, slack = 0.5) => r.x >= wa.x - slack && r.y >= wa.y - slack && r.x + r.w <= wa.x + wa.width + slack && r.y + r.h <= wa.y + wa.height + slack
const rnd = (a, b) => a + Math.random() * (b - a)

for (const [name, displays] of Object.entries(LAYOUTS)) {
  const xs = displays.flatMap((d) => [d.workArea.x, d.workArea.x + d.workArea.width])
  const ys = displays.flatMap((d) => [d.workArea.y, d.workArea.y + d.workArea.height])
  const box = { x0: Math.min(...xs) - 600, x1: Math.max(...xs) + 600, y0: Math.min(...ys) - 600, y1: Math.max(...ys) + 600 }
  for (let i = 0; i < 20000; i++) {
    // Bias half the drops to within 250px of some edge, where the bugs live.
    let p
    if (i % 2) {
      const d = displays[i % displays.length].workArea
      const side = i % 4
      p = side === 0 ? { x: d.x + rnd(-80, 250), y: rnd(d.y - 80, d.y + d.height + 80) }
        : side === 1 ? { x: d.x + d.width - rnd(-80, 250), y: rnd(d.y - 80, d.y + d.height + 80) }
        : side === 2 ? { x: rnd(d.x - 80, d.x + d.width + 80), y: d.y + rnd(-80, 250) }
        : { x: rnd(d.x - 80, d.x + d.width + 80), y: d.y + d.height - rnd(-80, 250) }
    } else p = { x: rnd(box.x0, box.x1), y: rnd(box.y0, box.y1) }
    const v = i % 3 === 0 ? { x: rnd(-4000, 4000), y: rnd(-4000, 4000) } : { x: 0, y: 0 }

    // 1. while dragging, Billy is always wholly on a screen
    const dp = D.dragPoint(displays, p)
    const dd = displays.find((d) => d.id === dp.displayId).workArea
    checks++
    if (!within(dd, { x: dp.x - D.BODY + 1, y: dp.y - D.BODY + 1, w: 2 * D.BODY - 2, h: 2 * D.BODY - 2 })) fail('drag off screen', { name, p, dp })

    // 2. on release
    const r = D.decide(displays, dp, v)
    for (const tucked of [false, true]) {
      if (tucked && r.dock.mode === 'float') continue
      const L = D.layout(displays, r.dock, r.center, tucked)
      const wa = displays.find((d) => d.id === L.displayId).workArea
      checks += 4
      if (!within(wa, { x: L.win.x, y: L.win.y, w: D.SIZE, h: D.SIZE })) fail('window off its screen', { name, p, r, L })
      if (L.win.x + L.anchor.x !== Math.round(L.center.x) && Math.abs(L.win.x + L.anchor.x - L.center.x) > 1) fail('anchor mismatch', { name, L })
      if (!tucked && !within(wa, { x: L.center.x - D.BODY + 2, y: L.center.y - D.BODY + 2, w: 2 * D.BODY - 4, h: 2 * D.BODY - 4 })) fail('Billy off screen', { name, p, r, L })
      if (!tucked) {
        // a docked Billy sits exactly EDGE from the edge(s) he docked to
        const e = { l: L.center.x - wa.x, r: wa.x + wa.width - L.center.x, t: L.center.y - wa.y, b: wa.y + wa.height - L.center.y }
        const sides = r.dock.mode === 'corner' ? [r.dock.side[0], r.dock.side[1]] : r.dock.mode === 'edge' ? [r.dock.side[0]] : []
        for (const s of sides) if (Math.abs(e[s] - D.EDGE) > 1) fail('dock not flush', { name, r, e })
        // a floating Billy was not near an edge (else he'd have docked)
        if (r.dock.mode === 'float' && Math.min(e.l, e.r, e.t, e.b) < D.SNAP - 1) fail('floated inside snap zone', { name, r, e })
        // the anchor leaves room for his pad inside the window
        if (L.anchor.x < 58 || L.anchor.y < 58 || L.anchor.x > D.SIZE - 58 || L.anchor.y > D.SIZE - 58) fail('pad clipped by window', { name, L })
      }
    }
    // 3. a still drop near no edge stays where it was let go
    if (v.x === 0 && v.y === 0 && r.dock.mode === 'float') {
      checks++
      if (Math.hypot(r.center.x - dp.x, r.center.y - dp.y) > 1) fail('float moved on release', { name, dp, r })
    }
  }
}
console.log(`${checks} checks, ${failures} failures`)
process.exit(failures ? 1 : 0)
