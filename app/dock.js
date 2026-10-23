/**
 * Where Billy goes. Pure geometry, no Electron, so it can be stress-tested on its own
 * (scripts/stress-dock.mjs).
 *
 * Everything is decided from BILLY'S CENTRE, never from his window. The window is a 420px
 * transparent square that is only there to give the faces room; measuring snaps from its
 * edges made Billy snap while he was still far from the edge, park in blank space, or drift
 * off screen. Here:
 *   - while dragging, Billy's centre is held on a screen with his whole body visible;
 *   - on release, he docks to an edge or corner only if HE is near it, otherwise he floats
 *     exactly where he was let go;
 *   - the window is then placed fully on that screen, and Billy's spot inside it (the anchor)
 *     is wherever he actually is, so nothing jumps.
 */

const SIZE = 420        // the window square
const EDGE = 64         // a docked Billy's centre, from the screen edge
const TUCK = 16         // ... and when tucked away (he peeks out)
const BODY = 62         // half of Billy's pad plus a small margin: the part that must stay on screen
const SNAP = 118        // Billy's centre this close to an edge on release: he docks to it
const PULL = 190        // ... and this close while dragging: the edge starts to pull him in

const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi))

/** The screen a point belongs to: the one containing it, else the nearest (gaps between
 *  monitors of different sizes, or a point thrown past the outer edge). */
function displayFor(displays, p, preferId) {
  const pref = preferId != null && displays.find((d) => d.id === preferId)
  if (pref && inside(pref.workArea, p)) return pref
  const hit = displays.find((d) => inside(d.workArea, p))
  if (hit) return hit
  let best = displays[0], bestD = Infinity
  for (const d of displays) {
    const wa = d.workArea
    const dx = Math.max(wa.x - p.x, 0, p.x - (wa.x + wa.width))
    const dy = Math.max(wa.y - p.y, 0, p.y - (wa.y + wa.height))
    const dist = Math.hypot(dx, dy)
    if (dist < bestD) { best = d; bestD = dist }
  }
  return best
}
function inside(wa, p) { return p.x >= wa.x && p.x < wa.x + wa.width && p.y >= wa.y && p.y < wa.y + wa.height }

/** Keep Billy's whole body on a screen. */
function hold(displays, p, preferId) {
  const d = displayFor(displays, p, preferId)
  const wa = d.workArea
  return { x: clamp(p.x, wa.x + BODY, wa.x + wa.width - BODY), y: clamp(p.y, wa.y + BODY, wa.y + wa.height - BODY), display: d }
}

function edgesOf(wa, p) {
  return { l: p.x - wa.x, r: wa.x + wa.width - p.x, t: p.y - wa.y, b: wa.y + wa.height - p.y }
}

/** While dragging: Billy follows the pointer, held on screen, and an edge he comes near pulls
 *  him in a little (stronger the closer), so docking feels magnetic. Also reports which edges
 *  are pulling and how hard, for the renderer's goo to reach toward them. */
function dragPoint(displays, p) {
  const held = hold(displays, p)
  const wa = held.display.workArea
  const e = edgesOf(wa, held)
  const ease = (t) => t * t * (3 - 2 * t)
  let x = held.x, y = held.y
  const near = []
  const pullX = e.l < e.r ? { side: 'left', d: e.l, to: wa.x + EDGE } : { side: 'right', d: e.r, to: wa.x + wa.width - EDGE }
  const pullY = e.t < e.b ? { side: 'top', d: e.t, to: wa.y + EDGE } : { side: 'bottom', d: e.b, to: wa.y + wa.height - EDGE }
  for (const [axis, pull] of [['x', pullX], ['y', pullY]]) {
    if (pull.d >= PULL) continue
    const s = ease(1 - (pull.d - BODY) / (PULL - BODY))
    if (axis === 'x') x += (pull.to - x) * s * 0.42
    else y += (pull.to - y) * s * 0.42
    near.push({ side: pull.side, strength: Math.max(0, Math.min(1, s)), screen: axis === 'x' ? (pull.side === 'left' ? wa.x : wa.x + wa.width) : (pull.side === 'top' ? wa.y : wa.y + wa.height) })
  }
  return { x, y, displayId: held.display.id, near }
}

/** On release: where Billy ends up. `v` is his throw velocity in px/s; a flick carries. */
function decide(displays, p, v = { x: 0, y: 0 }) {
  // A flick carries, but only so far (180px) and never onto another screen: the screen he was
  // let go on is the one he lands on.
  const release = displayFor(displays, p)
  const reach = (n) => Math.max(-180, Math.min(180, (Number.isFinite(n) ? n : 0) * 0.12))
  const thrown = { x: p.x + reach(v.x), y: p.y + reach(v.y) }
  const held = hold([release], thrown)
  const d = held.display, wa = d.workArea
  const e = edgesOf(wa, held)
  const h = e.l < SNAP ? 'l' : e.r < SNAP ? 'r' : null
  const vv = e.t < SNAP ? 't' : e.b < SNAP ? 'b' : null
  if (h && vv) return { dock: { mode: 'corner', side: vv + h, displayId: d.id }, center: centerFor({ mode: 'corner', side: vv + h }, wa, held, false) }
  if (h) { const dock = { mode: 'edge', side: h === 'l' ? 'left' : 'right', displayId: d.id }; return { dock, center: centerFor(dock, wa, held, false) } }
  if (vv) { const dock = { mode: 'edge', side: vv === 't' ? 'top' : 'bottom', displayId: d.id }; return { dock, center: centerFor(dock, wa, held, false) } }
  return { dock: { mode: 'float', displayId: d.id }, center: { x: held.x, y: held.y } }
}

/** Billy's centre for a dock, keeping his position along the edge. */
function centerFor(dock, wa, p, tucked) {
  const m = tucked ? TUCK : EDGE
  const alongX = clamp(p.x, wa.x + EDGE, wa.x + wa.width - EDGE)
  const alongY = clamp(p.y, wa.y + EDGE, wa.y + wa.height - EDGE)
  if (dock.mode === 'edge') {
    if (dock.side === 'left') return { x: wa.x + m, y: alongY }
    if (dock.side === 'right') return { x: wa.x + wa.width - m, y: alongY }
    if (dock.side === 'top') return { x: alongX, y: wa.y + m }
    return { x: alongX, y: wa.y + wa.height - m }
  }
  if (dock.mode === 'corner') {
    const s = dock.side
    return { x: s[1] === 'l' ? wa.x + m : wa.x + wa.width - m, y: s[0] === 't' ? wa.y + m : wa.y + wa.height - m }
  }
  return { x: clamp(p.x, wa.x + BODY, wa.x + wa.width - BODY), y: clamp(p.y, wa.y + BODY, wa.y + wa.height - BODY) }
}

/** The window for Billy at `center`: fully on his screen, and Billy's spot inside it. */
function layout(displays, dock, center, tucked) {
  const d = displayFor(displays, center, dock?.displayId)
  const wa = d.workArea
  const c = dock && dock.mode !== 'float' ? centerFor(dock, wa, center, tucked) : centerFor({ mode: 'float' }, wa, center, false)
  const win = {
    x: Math.round(clamp(c.x - SIZE / 2, wa.x, wa.x + wa.width - SIZE)),
    y: Math.round(clamp(c.y - SIZE / 2, wa.y, wa.y + wa.height - SIZE)),
  }
  return { win, anchor: { x: Math.round(c.x - win.x), y: Math.round(c.y - win.y) }, center: c, displayId: d.id }
}

module.exports = { SIZE, EDGE, TUCK, BODY, SNAP, PULL, displayFor, hold, dragPoint, decide, centerFor, layout }
