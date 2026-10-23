/*
 * Where the faces go, for Billy sitting anywhere in his window (scripts/stress-fan.mjs tests it).
 *
 * Goo bridges any two shapes whose gap is smaller than roughly its blur, so at rest every
 * droplet keeps a clear gap of 3 blurs from every other droplet, from Billy's pad and from the
 * strip that melts him into an edge. They only merge while travelling: the split you see as
 * they pop out.
 */
export const W = 420
export const BLUR = 9
export const ICON = 46
export const PAD = 116
export const CLEAR = ICON + BLUR * 3                      // centre-to-centre between two droplets
export const FIRST_RING = PAD / 2 + ICON / 2 + BLUR * 3

const deg = (r) => (r * 180) / Math.PI
const rad = (d) => (d * Math.PI) / 180
const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

/** The open side: from Billy toward the middle of his window (straight up when centred). */
export function preferredAngle(anchor) {
  const dx = W / 2 - anchor.x, dy = W / 2 - anchor.y
  return Math.hypot(dx, dy) < 4 ? -90 : deg(Math.atan2(dy, dx))
}

/** Sides of the window that are a screen edge Billy is melted into. */
function meltedSides(dock) {
  if (!dock || dock.mode === 'float') return []
  if (dock.mode === 'edge') return [dock.side]
  const s = dock.side
  return [s[0] === 't' ? 'top' : 'bottom', s[1] === 'l' ? 'left' : 'right']
}

export function fanLayout(n, anchor, dock) {
  if (!n) return []
  const margin = ICON / 2 + 8
  const meltMargin = ICON / 2 + 9 + BLUR * 3              // clear of the melt strip, too
  const sides = meltedSides(dock)
  const m = { left: sides.includes('left') ? meltMargin : margin, right: sides.includes('right') ? meltMargin : margin,
    top: sides.includes('top') ? meltMargin : margin, bottom: sides.includes('bottom') ? meltMargin : margin }
  const ok = (p) => p.x >= m.left && p.x <= W - m.right && p.y >= m.top && p.y <= W - m.bottom

  // Room all round (floating mid-window): an even ring looks best.
  const room = Math.min(anchor.x, anchor.y, W - anchor.x, W - anchor.y)
  const minStep = 2 * deg(Math.asin(Math.min(1, CLEAR / (2 * FIRST_RING))))
  if (room >= FIRST_RING + margin && n <= Math.floor(360 / minStep)) {
    return Array.from({ length: n }, (_, i) => {
      const a = rad(-90 + (360 / n) * i)
      return { x: anchor.x + Math.cos(a) * FIRST_RING, y: anchor.y + Math.sin(a) * FIRST_RING }
    })
  }

  // Otherwise: fill rings outward, each one a tidy fan centred on the open side, taking only
  // spots that stay in the window and keep their distance from the others.
  const pref = preferredAngle(anchor)
  const out = []
  for (let r = FIRST_RING; out.length < n && r < W; r += CLEAR * 0.92) {
    const step = 2 * deg(Math.asin(Math.min(1, CLEAR / (2 * r))))
    const candidates = []
    for (let k = 0; k * step < 360; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const a = pref + sign * k * step
        const p = { x: anchor.x + Math.cos(rad(a)) * r, y: anchor.y + Math.sin(rad(a)) * r, a }
        if (ok(p)) candidates.push(p)
      }
    }
    candidates.sort((p, q) => angleGap(p.a, pref) - angleGap(q.a, pref))
    for (const p of candidates) {
      if (out.length >= n) break
      if (out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= CLEAR - 0.5)) out.push({ x: p.x, y: p.y })
    }
  }
  return out
}

/** The strip that melts a docked Billy into his edge or corner (his window is flush there). */
export function meltFor(dock, anchor) {
  if (!dock || dock.mode === 'float') return null
  const s = dock.side
  if (dock.mode === 'edge') {
    const v = s === 'left' || s === 'right', len = 132, th = 18
    return v
      ? { x: s === 'left' ? -th / 2 : W - th / 2, y: anchor.y - len / 2, w: th, h: len, r: th / 2 }
      : { x: anchor.x - len / 2, y: s === 'top' ? -th / 2 : W - th / 2, w: len, h: th, r: th / 2 }
  }
  const size = 70
  return { x: s[1] === 'l' ? -size / 2 : W - size / 2, y: s[0] === 't' ? -size / 2 : W - size / 2, w: size, h: size, r: size / 2 }
}

/** While dragging near a screen edge, the goo reaches toward it: a bud on Billy's side facing
 *  the edge that grows with the pull, so you can feel the dock coming before you let go. */
export function reachFor(near, anchor) {
  return (near || []).filter((n) => n.strength > 0.02).map((n) => {
    const r = PAD / 2 + 4 + n.strength * 22
    const dir = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[n.side]
    const size = 26 + n.strength * 18
    return { key: n.side, x: anchor.x + dir[0] * r - size / 2, y: anchor.y + dir[1] * r - size / 2, w: size, h: size, r: size / 2 }
  })
}

/** Where the badge droplet sits on Billy's pad: up and to the open side. */
export function badgeAngle(anchor) { return rad(preferredAngle(anchor) + 40) }
