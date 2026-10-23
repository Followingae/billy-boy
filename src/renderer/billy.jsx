import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { Liquid } from 'liquid-gooey'
import { BotAvatar } from 'bot-avatars'
import { Icon } from './icons'
import { toneOf } from './tone'

/*
 * Billy, and the faces that drip out of him.
 *
 * Everything lives in one liquid group, so Billy's pad, the strip that melts him into a
 * screen edge, his badge and every face droplet are one surface: they bridge, split and
 * merge like a drop of something thick. Hover Billy and the faces split off him in an arc
 * away from the edge he sits on; hover a face and it stretches into a pill that reads out.
 */

const W = 420
const CENTER = { x: W / 2, y: W / 2 }
const big = { pad: 116, bot: 94, icon: 46 }
const small = { pad: 74, bot: 56, icon: 46 }
const URGENT = { calm: 'var(--ink)', warn: 'var(--warn)', alert: 'var(--alert)' }

import { fanLayout, meltFor, reachFor, badgeAngle, BLUR } from './fan.mjs'

/** How wide a face grows when hovered, and where its pill sits. */
function pillFor(f, p, anchor) {
  const label = f.error && !f.result ? 'Needs setup' : f.result?.caption || f.name
  const value = f.result?.value || ''
  const w = Math.min(210, Math.max(140, 74 + Math.max(label.length, f.name.length) * 6.4 + value.length * 8))
  const dir = p.x >= anchor.x - 1 ? 1 : -1
  let x = dir > 0 ? p.x - 23 : p.x + 23 - w
  x = Math.min(Math.max(x, 6), W - 6 - w)
  return { x, y: p.y - 23, w, h: 46, dir, label, value }
}

/*
 * Make room. When a face stretches into a pill, every other droplet is pushed clear of it
 * (and of Billy, and of each other), then springs to its new spot; the goo bridges them for
 * a moment as they slide past, which is the "moving out of the way" look. A weak pull back
 * toward each droplet's home keeps the ring's shape. A few dozen relaxation passes on at
 * most a dozen circles: well under a millisecond.
 */
function makeRoom(points, hoverIdx, pill, anchor, padR) {
  const GAP = BLUR * 2.6, R = 23
  const pts = points.map((p) => ({ x: p.x, y: p.y, hx: p.x, hy: p.y }))
  if (hoverIdx < 0 || !pill) return pts
  const lo = R + 4, hi = W - R - 4
  for (let it = 0; it < 60; it++) {
    pts.forEach((a, i) => {
      if (i === hoverIdx) return
      // clear of the pill (a rectangle with round ends; a rectangle is close enough)
      const nx = Math.min(Math.max(a.x, pill.x), pill.x + pill.w), ny = Math.min(Math.max(a.y, pill.y), pill.y + pill.h)
      let dx = a.x - nx, dy = a.y - ny, d = Math.hypot(dx, dy)
      const need = R + GAP
      if (d < 0.01) {
        // The centre is inside the pill: leave by the nearest side, then clear it.
        const out = [[a.x - pill.x, -1, 0], [pill.x + pill.w - a.x, 1, 0], [a.y - pill.y, 0, -1], [pill.y + pill.h - a.y, 0, 1]]
          .sort((m, n) => m[0] - n[0])[0]
        a.x += out[1] * (out[0] + need); a.y += out[2] * (out[0] + need)
      } else if (d < need) { a.x += (dx / d) * (need - d); a.y += (dy / d) * (need - d) }
      // clear of Billy
      dx = a.x - anchor.x; dy = a.y - anchor.y; d = Math.hypot(dx, dy) || 1
      if (d < padR + R + GAP) { a.x = anchor.x + (dx / d) * (padR + R + GAP); a.y = anchor.y + (dy / d) * (padR + R + GAP) }
      // clear of each other
      pts.forEach((b, j) => {
        if (j <= i || j === hoverIdx) return
        const ex = b.x - a.x, ey = b.y - a.y, e = Math.hypot(ex, ey) || 1, min = 2 * R + GAP
        if (e < min) { const k = (min - e) / 2 / e; a.x -= ex * k; a.y -= ey * k; b.x += ex * k; b.y += ey * k }
      })
      // a gentle pull home, and stay on screen
      a.x += (a.hx - a.x) * 0.04; a.y += (a.hy - a.y) * 0.04
      a.x = Math.min(Math.max(a.x, lo), hi); a.y = Math.min(Math.max(a.y, lo), hi)
    })
  }
  return pts
}

// ── sound ──────────────────────────────────────────────────────────────────────────────
// Billy is a drop of something thick, so he sounds like one: landing is a magnetic clack
// with a liquid "bloop" on top and a short room tail; a corner rings two notes (a fifth), an
// edge one. Faces popping out are tiny bubbles. Everything is synthesised, no audio files.
let audio = null, bus = null
function out() {
  if (audio) return bus
  audio = new AudioContext()
  bus = audio.createGain(); bus.gain.value = 0.9
  const comp = audio.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4
  // a small room: two damped feedback delays
  const wet = audio.createGain(); wet.gain.value = 0.18
  for (const [time, fb] of [[0.047, 0.32], [0.071, 0.26]]) {
    const d = audio.createDelay(); d.delayTime.value = time
    const g = audio.createGain(); g.gain.value = fb
    const lp = audio.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600
    bus.connect(d); d.connect(lp).connect(g).connect(d); lp.connect(wet)
  }
  bus.connect(comp); wet.connect(comp); comp.connect(audio.destination)
  return bus
}
const jitter = (v, p = 0.03) => v * (1 + (Math.random() * 2 - 1) * p)

function bloop(t, from, to, dur, gain) {
  const o = audio.createOscillator(), g = audio.createGain(), lp = audio.createBiquadFilter()
  o.type = 'sine'
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.55)
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(4200, t + dur * 0.4); lp.Q.value = 6
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(lp).connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05)
}
function clack(t, gain) {
  const len = Math.floor(audio.sampleRate * 0.03)
  const buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4
  const n = audio.createBufferSource(); n.buffer = buf
  const bp = audio.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = jitter(3200, 0.1); bp.Q.value = 1.4
  const ng = audio.createGain(); ng.gain.value = gain
  n.connect(bp).connect(ng).connect(bus); n.start(t)
  // the body: a felt thump under the click
  const o = audio.createOscillator(), g = audio.createGain()
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.11)
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * 1.4, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
  o.connect(g).connect(bus); o.start(t); o.stop(t + 0.2)
}
const sfx = {
  land(corner, speed = 1) {
    try {
      out(); const t = audio.currentTime + 0.005
      const k = Math.min(1.25, 0.75 + speed * 0.5)
      clack(t, 0.30 * k)
      const root = jitter(392)                    // G4
      bloop(t + 0.018, root * 0.55, root, 0.16, 0.20 * k)
      if (corner) bloop(t + 0.085, root * 0.8, root * 1.5, 0.2, 0.15 * k)   // up a fifth
    } catch {}
  },
  lift() { try { out(); bloop(audio.currentTime, jitter(520), 300, 0.12, 0.07) } catch {} },
  pop(i) { try { out(); bloop(audio.currentTime + i * 0.032, jitter(700 + i * 90, 0.05), jitter(1300 + i * 120, 0.05), 0.07, 0.035) } catch {} },
  tuck() { try { out(); bloop(audio.currentTime, 600, 260, 0.18, 0.09) } catch {} },
}

function quietNow(q) {
  if (!q) return false
  const h = new Date().getHours()
  return q.from > q.to ? h >= q.from || h < q.to : h >= q.from && h < q.to
}

function useVolume() {
  const [vol, setVol] = useState(null)
  const busy = useRef(false)
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (busy.current) return
      busy.current = true
      const r = await window.billy.volume('get').catch(() => null)
      busy.current = false
      if (alive && r && !r.error) setVol((v) => (v && v.volume === r.volume && v.muted === r.muted ? v : r))
    }
    tick(); const id = setInterval(tick, 180)
    return () => { alive = false; clearInterval(id) }
  }, [])
  const change = useCallback(async (cmd) => {
    busy.current = true
    const r = await window.billy.volume(cmd).catch(() => null)
    busy.current = false
    if (r && !r.error) setVol(r)
  }, [])
  return [vol, change]
}

function Billy() {
  const [st, setSt] = useState({ faces: [], look: {}, pinned: null, quiet: null, sound: true })
  const [dock, setDock] = useState({ mode: 'float', tucked: false, anchor: CENTER })
  const [instant, setInstant] = useState(true)
  const [near, setNear] = useState([])
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(null)
  const intent = useRef({ enter: null, leave: null })
  const hoverIn = (uid) => {
    clearTimeout(intent.current.leave); clearTimeout(intent.current.enter)
    intent.current.enter = setTimeout(() => setHover(uid), hover ? 60 : 140)
  }
  const hoverOut = (uid) => {
    clearTimeout(intent.current.enter)
    clearTimeout(intent.current.leave)
    intent.current.leave = setTimeout(() => setHover((h) => (h === uid ? null : h)), 260)
  }
  const [cardUid, setCardUid] = useState(null)
  const [squash, setSquash] = useState(1)
  const [hop, setHop] = useState(false)
  const [vol, changeVol] = useVolume()
  const [volFlash, setVolFlash] = useState(0)
  const closeTimer = useRef(null)
  const lastVol = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => window.billy.onState(setSt), [])
  // The taskbar and tray icon is Billy as he looks right now: snapshot his canvas once he has
  // been drawn, and again whenever his look changes.
  const lookKey = JSON.stringify(st.look || {})
  useEffect(() => {
    const t = setTimeout(() => {
      const c = document.querySelector('.bot canvas')
      if (!c || !c.width) return
      const out = document.createElement('canvas'); out.width = out.height = 256
      const side = Math.min(c.width, c.height) * 0.72     // his canvas has room to hop; crop to him
      out.getContext('2d').drawImage(c, (c.width - side) / 2, (c.height - side) / 2, side, side, 0, 0, 256, 256)
      try { window.billy.setIcon(out.toDataURL('image/png')) } catch {}
    }, 1600)
    return () => clearTimeout(t)
  }, [lookKey])
  useEffect(() => window.billy.onCardOpen(setCardUid), [])
  useEffect(() => window.billy.onNear((n) => setNear(Array.isArray(n) ? n : [])), [])
  useEffect(() => window.billy.onNudge(() => { setHop(true); setTimeout(() => setHop(false), 2200) }), [])
  useEffect(() => window.billy.onDemoOpen((what) => { soundOn.current = false; setOpen(true); if (what !== '1') setHover(what) }), [])
  const soundOn = useRef(true)
  useEffect(() => { soundOn.current = st.sound !== false }, [st.sound])
  const wasTucked = useRef(false)
  useEffect(() => window.billy.onDock((d) => {
    // A re-anchor that must not animate (lift-off, start-up) is drawn in one frame; Billy's
    // window moves in the same instant, so on screen he does not move at all.
    setInstant(!!d.instant || !!d.lifted)
    setDock({ ...d, anchor: d.anchor || CENTER }); setNear([])
    if (d.instant || d.lifted) requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)))
    if (d.landed) {
      setSquash(0.86); setTimeout(() => setSquash(1), 380)
      setHop(true); setTimeout(() => setHop(false), 1300)
      if (soundOn.current) sfx.land(d.mode === 'corner', d.speed || 0)
    } else if (!!d.tucked !== wasTucked.current && soundOn.current) sfx.tuck()
    wasTucked.current = !!d.tucked
    if (d.lifted) { setOpen(false); setHover(null); if (soundOn.current) sfx.lift() }
  }), [])

  // The keyboard knob moved the volume: show it for a moment.
  useEffect(() => {
    if (!vol) return
    const prev = lastVol.current; lastVol.current = vol
    if (prev && (prev.volume !== vol.volume || prev.muted !== vol.muted)) setVolFlash(Date.now())
  }, [vol])
  const [, force] = useState(0)
  useEffect(() => { if (!volFlash) return; const t = setTimeout(() => force((n) => n + 1), 1500); return () => clearTimeout(t) }, [volFlash])
  const showVol = volFlash && Date.now() - volFlash < 1450

  const tucked = !!dock.tucked
  const S = tucked ? small : big
  const anchor = dock.anchor || CENTER

  // Faces, with the built-in volume reading filled in here (the renderer owns it).
  const faces = useMemo(() => st.faces.filter((f) => !f.missing && !f.hidden).map((f) => {
    if (f.type !== 'volume') return f
    const pct = vol ? Math.round(vol.volume * 100) : null
    return { ...f, icon: vol?.muted ? 'mute' : 'volume', result: { value: pct == null ? '' : String(pct), caption: vol?.muted ? 'Muted' : 'Volume', urgency: 'calm' } }
  }), [st.faces, vol])

  const urgentOf = (f) => (f.error ? 'warn' : f.result?.urgency || 'calm')
  const worst = faces.reduce((w, f) => (urgentOf(f) === 'alert' ? 'alert' : urgentOf(f) === 'warn' && w !== 'alert' ? 'warn' : w), 'calm')
  const pinned = faces.find((f) => f.uid === st.pinned) || null     // nothing ticked = no badge; the urgent dot still shows
  const playing = faces.some((f) => f.type === 'spotify' && f.result?.playing)
  const focusing = faces.some((f) => f.type === 'focus' && f.result?.focusing)
  const sleeping = !hop && !open && (tucked || quietNow(st.quiet)) && worst !== 'alert'

  const fan = fanLayout(faces.length, anchor, dock)
  const hoverIdx = open && hover ? faces.findIndex((f) => f.uid === hover) : -1
  const pill = hoverIdx >= 0 && fan[hoverIdx] ? pillFor(faces[hoverIdx], fan[hoverIdx], anchor) : null
  const spots = makeRoom(fan, pill ? hoverIdx : -1, pill, anchor, S.pad / 2)

  // ── hit testing: the window is click-through except over Billy and his droplets ───────
  const overRef = useRef(false)
  useEffect(() => {
    const onMove = (e) => {
      if (dragRef.current?.dragging) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const over = !!el?.closest('[data-hit]')
      if (over !== overRef.current) { overRef.current = over; window.billy.hit(over) }
      if (over) { clearTimeout(closeTimer.current); closeTimer.current = null }
      else if (open && !closeTimer.current) closeTimer.current = setTimeout(() => { setOpen(false); setHover(null); closeTimer.current = null }, 420)
    }
    const onLeave = () => { overRef.current = false; window.billy.hit(false); if (open) closeTimer.current = setTimeout(() => { setOpen(false); setHover(null) }, 420) }
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => { window.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave) }
  }, [open])
  useEffect(() => { if (cardUid) { setOpen(false); setHover(null) } }, [cardUid])
  useEffect(() => { if (open && soundOn.current) faces.slice(0, 6).forEach((_, i) => sfx.pop(i)) }, [open])

  // ── Billy: drag to move, click for the pinned face, scroll for volume ───────────────
  const onDown = (e) => {
    if (e.button !== 0) return
    dragRef.current = { x: e.screenX, y: e.screenY, dragging: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMoveBilly = (e) => {
    const d = dragRef.current
    if (!d) return
    if (!d.dragging && Math.hypot(e.screenX - d.x, e.screenY - d.y) > 4) {
      d.dragging = true; setOpen(false)
      window.billy.dragStart({ sx: d.x, sy: d.y })
    }
    if (d.dragging) window.billy.dragMove({ sx: e.screenX, sy: e.screenY })
  }
  const onUp = () => {
    const d = dragRef.current; dragRef.current = null
    if (!d) return
    if (d.dragging) { window.billy.dragEnd(); return }
    if (tucked) { window.billy.toggleTuck(); return }
    if (pinned && pinned.type !== 'volume') window.billy.openCard(pinned.uid)
    else setOpen((o) => !o)
  }
  const onWheel = (e) => {
    if (!vol) return
    const v = Math.min(1, Math.max(0, vol.volume + (e.deltaY < 0 ? 0.02 : -0.02)))
    changeVol(`set ${v.toFixed(3)}`)
  }

  const clickFace = (f) => {
    if (f.type === 'volume') { changeVol('mute'); return }
    if (f.error && !f.result) { window.billy.openRoom(`face:${f.uid}`); return }
    window.billy.openCard(f.uid)
  }

  const melt = meltFor(dock, anchor)
  const reach = reachFor(near, anchor)
  const dragging = near.length > 0

  // The pinned face's reading rides on a droplet stuck to Billy's pad.
  const badgeFace = showVol ? faces.find((f) => f.type === 'volume') : pinned
  const badgeText = badgeFace ? (badgeFace.result?.value || '') : ''
  const showBadge = !!badgeFace && !!badgeText && !open && !tucked && !dragging
  const ba = badgeAngle(anchor)
  const badgeW = Math.max(40, 22 + badgeText.length * 9 + 18)
  const bx = anchor.x + Math.cos(ba) * (S.pad / 2 + 2) - badgeW / 2
  const by = anchor.y + Math.sin(ba) * (S.pad / 2 + 2) - 15


  return (
    <Liquid
      className={`stage ${open ? 'open' : ''}`}
      blur={BLUR} contrast={22} fill="var(--surface)"
      shadow="0 16px 34px rgba(48, 32, 18, .20), 0 3px 8px rgba(48, 32, 18, .14)"
      filterPadding={40}
      style={{ width: W, height: W, '--billy': toneOf(st.look.color || '#ff8a3d') }}
    >
      {open && <div data-hit className="zone" style={{ left: anchor.x, top: anchor.y }} onContextMenu={(e) => { e.preventDefault(); window.billy.menu(null) }} />}

      {melt && (
        <Liquid.Item key="melt" x={melt.x} y={melt.y} scale={1} transition={instant ? { duration: 0 } : 'bouncy'}
          style={{ position: 'absolute', left: 0, top: 0, width: melt.w, height: melt.h, borderRadius: melt.r }}>
          <div className="blob" style={{ width: melt.w, height: melt.h, borderRadius: melt.r }} />
        </Liquid.Item>
      )}

      {faces.map((f, i) => {
        const home = open ? spots[i] : null      // more faces than fit stay tucked in Billy (right-click lists all)
        const value = f.result?.value || ''
        const u = urgentOf(f)
        const isHover = !!home && i === hoverIdx && !!pill
        const x = isHover ? pill.x : (home || anchor).x - S.icon / 2
        const y = isHover ? pill.y : (home || anchor).y - S.icon / 2
        return (
          <Liquid.Item key={f.uid} x={x} y={y} scale={home ? 1 : 0.3}
            transition={instant ? { duration: 0 } : !home ? 'snappy' : pill ? { stiffness: 150, damping: 20, mass: 1 } : { stiffness: 230, damping: 20, mass: 1 }}
            delay={home && !pill ? 40 + i * 38 : 0}
            style={{ position: 'absolute', left: 0, top: 0, zIndex: isHover ? 5 : 2 }}>
            <button
              data-hit={home ? '' : undefined}
              className={`face ${isHover ? 'wide' : ''} ${isHover && pill.dir < 0 ? 'rtl' : ''} ${home ? '' : 'hidden'} ${pill && !isHover ? 'dim' : ''}`}
              style={{ width: isHover ? pill.w : S.icon, height: S.icon, '--u': URGENT[u] }}
              onMouseEnter={() => hoverIn(f.uid)}
              onMouseLeave={() => hoverOut(f.uid)}
              onClick={() => clickFace(f)}
              onContextMenu={(e) => { e.preventDefault(); window.billy.menu(f.uid) }}
              aria-label={`${f.name}: ${value} ${f.result?.caption || ''}`}
            >
              <span className="glyph">
                {f.result?.art ? <img src={f.result.art} alt="" /> : <Icon name={f.icon} size={19} />}
                {u !== 'calm' && !isHover && !(value && value.length <= 3 && f.type !== 'volume') && <i className="dot" />}
              </span>
              {isHover && (
                <span className="read">
                  <b>{value ? <span className="v">{value}</span> : null}{f.name}</b>
                  <small>{pill.label}</small>
                </span>
              )}
              {!isHover && value && value.length <= 3 && f.type !== 'volume' && <span className={`count ${u}`}>{value}</span>}
            </button>
          </Liquid.Item>
        )
      })}

      <Liquid.Item key="badge" x={showBadge ? bx : anchor.x - badgeW / 2} y={showBadge ? by : anchor.y - 15} scale={showBadge ? 1 : 0.2}
        transition={instant ? { duration: 0 } : 'bouncy'} style={{ position: 'absolute', left: 0, top: 0, zIndex: 3 }}>
        <div className={`badge ${showBadge ? '' : 'hidden'}`} style={{ width: badgeW, '--u': badgeFace ? URGENT[urgentOf(badgeFace)] : 'var(--ink)' }}>
          {badgeFace && <Icon name={badgeFace.icon} size={13} />}
          <span>{badgeText}</span>
        </div>
      </Liquid.Item>

      {reach.map((b) => (
        <Liquid.Item key={`reach-${b.key}`} x={b.x} y={b.y} transition={{ stiffness: 520, damping: 26, mass: 1 }}
          style={{ position: 'absolute', left: 0, top: 0, zIndex: 3 }}>
          <div className="blob" style={{ width: b.w, height: b.h, borderRadius: b.r }} />
        </Liquid.Item>
      ))}

      <Liquid.Item key="pad" x={anchor.x - S.pad / 2} y={anchor.y - S.pad / 2} scale={squash} transition={instant ? { duration: 0 } : 'bouncy'}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: 4 }}>
        <div
          data-hit
          className={`pad ${open ? 'is-open' : ''}`}
          style={{ width: S.pad, height: S.pad }}
          onPointerDown={onDown} onPointerMove={onMoveBilly} onPointerUp={onUp}
          onMouseEnter={() => { if (!dragRef.current && !tucked) setOpen(true) }}
          onWheel={onWheel}
          onContextMenu={(e) => { e.preventDefault(); window.billy.menu(null) }}
        />
      </Liquid.Item>

      {/* Billy rides on his own layer, never inside the liquid's transformed wrapper: a
          will-change layer is rasterised once at one scale and then stretched, which is what
          made him look low-res. Here his canvas paints 1:1 at the screen's pixel density. */}
      <div className={`bot ${squash < 1 ? 'squash' : ''} ${instant ? 'instant' : ''}`} style={{ left: anchor.x, top: anchor.y, '--s': S.bot }}>
          {worst === 'alert' && !open && <i className="urgent" aria-label="Something urgent" />}
          <BotAvatar
            type={st.look.type || 'droid'}
            color={st.look.color || undefined}
            shading={st.look.shading || 'fabric'}
            hat={st.look.hat && st.look.hat !== 'none' ? st.look.hat : undefined}
            headphones={playing}
            glasses={focusing ? 'round' : undefined}
            accessoryColor={playing ? '#1f1d1a' : undefined}
            face="mouth"
            state={hop ? 'working' : sleeping ? 'sleeping' : 'default'}
            size={S.bot}
            interactive={!tucked}
            jumpEvery={worst === 'alert' ? 5 : 11}
            aria-label="Billy"
          />
      </div>

    </Liquid>
  )
}


createRoot(document.getElementById('root')).render(<Billy />)
