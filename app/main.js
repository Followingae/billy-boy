/**
 * Billy Boy. A little desktop companion that sticks to your screen edges and corners and
 * tells you what needs you.
 *
 * WINDOWS
 *   billy   a transparent square, always on top, click-through everywhere except Billy and
 *           his face droplets. It never leaves the screen: docking snaps the square flush
 *           to an edge or corner and the renderer moves Billy onto that edge or corner.
 *   card    the detail card for one face, beside Billy.
 *   room    Billy's room: faces, connections, his look, behaviour.
 *
 * Billy reads and opens. The only things he ever does are yours to undo in a second: media
 * keys, the system volume, a focus timer. He never sends, approves or pays for anything.
 */
const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, globalShortcut, safeStorage,
  Notification, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

// Test runs (BILLY_DEMO) get their own folder and skip the single-instance lock, so they
// never touch, move or hand off to the user's running Billy.
app.setPath('userData', path.join(app.getPath('appData'), process.env.BILLY_DEMO ? 'billy-boy-demo' : 'billy-boy'))
const store = require('./store')
const geo = require('./dock')
const faces = require('./connectors')

const SIZE = geo.SIZE     // the billy window square
const CARD_W = 372
const DIST = path.join(__dirname, '..', 'dist')

let billy = null, card = null, room = null, tray = null
let placed = false
let cardFace = null

const debug = (...a) => { if (process.env.BILLY_DEBUG) console.log('[billy]', ...a) }
function logError(where, err) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'billy-errors.log'), `${new Date().toISOString()} ${where}: ${err && err.stack ? err.stack : err}\n`) } catch {}
}
process.on('uncaughtException', (e) => logError('main', e))
process.on('unhandledRejection', (e) => logError('promise', e))

const place = () => (process.env.BILLY_DEMO && demoPlace) || store.get().place
// Test runs (BILLY_DEMO) move Billy around but never save it: a demo once overwrote the spot
// the user had chosen on another monitor.
let demoPlace = null
function setPlace(patch) {
  if (process.env.BILLY_DEMO) { demoPlace = { ...place(), ...patch }; return }
  store.set({ place: { ...store.get().place, ...patch } })
}

// ── docking ────────────────────────────────────────────────────────────────────────────
// All positions are Billy's CENTRE on screen; app/dock.js turns that into a window and the
// spot inside it (the anchor) where the renderer draws him.
const displays = () => screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea }))
let anchor = { x: SIZE / 2, y: SIZE / 2 }

function moveTo(x, y) {
  if (!billy || !Number.isFinite(x) || !Number.isFinite(y)) { logError('moveTo', new Error(`refused ${x}, ${y}`)); return false }
  // `|| 0` turns -0 into 0: a spring overshooting an edge at 0 rounds to -0, and Electron
  // rejects -0 as a window coordinate ("conversion failure").
  // setBounds, not setPosition: moving between screens with different scaling otherwise
  // grows the window a few pixels each time, and every edge sum is built on its size.
  billy.setBounds({ x: Math.round(x) || 0, y: Math.round(y) || 0, width: SIZE, height: SIZE })
  return true
}

/** Billy's centre on screen right now. */
function billyCenter() {
  const [x, y] = billy.getPosition()
  return { x: x + anchor.x, y: y + anchor.y }
}

/** Saved place, upgraded from the old window-based format if needed. */
function savedCenter() {
  const p = place()
  if (Number.isFinite(p.cx) && Number.isFinite(p.cy)) return { x: p.cx, y: p.cy }
  if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
    const m = p.tucked ? geo.TUCK : geo.EDGE, d = p.dock || { mode: 'float' }, s = d.side || ''
    const ax = d.mode === 'float' ? SIZE / 2 : d.mode === 'edge' ? (s === 'left' ? m : s === 'right' ? SIZE - m : SIZE / 2) : (s[1] === 'l' ? m : SIZE - m)
    const ay = d.mode === 'float' ? SIZE / 2 : d.mode === 'edge' ? (s === 'top' ? m : s === 'bottom' ? SIZE - m : SIZE / 2) : (s[0] === 't' ? m : SIZE - m)
    return { x: p.x + ax, y: p.y + ay }
  }
  const wa = screen.getPrimaryDisplay().workArea
  return { x: wa.x + wa.width - geo.EDGE, y: wa.y + wa.height - geo.EDGE }
}

/** A damped spring: Billy carries the speed he was thrown with, lands a touch past the edge
 *  and settles back. That overshoot is what makes a snap feel physical. */
let anim = null
function glideTo(x, y, v = { x: 0, y: 0 }, { stiffness = 380, damping = 22 } = {}) {
  if (!billy) return
  clearInterval(anim)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  let [px, py] = billy.getPosition()
  let vx = v.x || 0, vy = v.y || 0, last = Date.now()
  anim = setInterval(() => {
    const now = Date.now(), dt = Math.min(0.032, (now - last) / 1000); last = now
    vx += (stiffness * (x - px) - damping * vx) * dt
    vy += (stiffness * (y - py) - damping * vy) * dt
    px += vx * dt; py += vy * dt
    if (!Number.isFinite(px) || !Number.isFinite(py) || !moveTo(px, py)) { clearInterval(anim); moveTo(x, y); return }
    if (Math.abs(x - px) < 0.5 && Math.abs(y - py) < 0.5 && Math.hypot(vx, vy) < 8) { clearInterval(anim); moveTo(x, y); placeCard() }
  }, 1000 / 120)
}

/**
 * Put Billy somewhere. The renderer switches to the new anchor at once while the window is
 * moved so Billy stays exactly where he is on screen; then the window springs to its final
 * spot, carrying any throw speed, so the landing has weight.
 */
function settle(dock, center, { tucked = false, velocity = null, landed = false, speed = 0, instant = false } = {}) {
  const L = geo.layout(displays(), dock, center, tucked)
  const tk = dock.mode === 'float' ? false : tucked
  const finalDock = { ...dock, displayId: L.displayId }
  const now = billyCenter()
  anchor = L.anchor
  billy.webContents.send('dock', { ...finalDock, tucked: tk, landed, speed, anchor: L.anchor, instant: true })
  setPlace({ dock: finalDock, tucked: tk, cx: L.center.x, cy: L.center.y, x: L.win.x, y: L.win.y })
  if (instant) { clearInterval(anim); moveTo(L.win.x, L.win.y); placeCard(); return }
  moveTo(now.x - L.anchor.x, now.y - L.anchor.y)          // same spot on screen, new anchor
  glideTo(L.win.x, L.win.y, velocity || { x: 0, y: 0 })
  debug('settle', finalDock, tk, L)
}
function applyDock(dock, tucked = false) { settle(dock, savedCenter(), { tucked }) }

// ── windows ────────────────────────────────────────────────────────────────────────────
const webPreferences = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }

function createBilly() {
  billy = new BrowserWindow({
    width: SIZE, height: SIZE, frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000', webPreferences,
  })
  billy.setAlwaysOnTop(true, 'screen-saver')
  billy.setVisibleOnAllWorkspaces(true)
  billy.loadFile(path.join(DIST, 'billy.html'))
  billy.setIgnoreMouseEvents(true, { forward: true })
  billy.once('ready-to-show', () => {
    const q = place()
    const start = geo.layout(displays(), q.dock || { mode: 'float' }, savedCenter(), !!q.tucked)
    anchor = start.anchor
    billy.setPosition(start.win.x, start.win.y)
    billy.showInactive()
    placed = true
    pushAll()
    billy.webContents.send('dock', { ...(q.dock || { mode: 'float' }), tucked: !!q.tucked, anchor, instant: true })
    const demo = process.env.BILLY_DEMO        // test switch: BILLY_DEMO=tl, left, float, right-tuck
    if (demo) setTimeout(() => {
      const [where, t] = demo.split('-')
      const d = screen.getPrimaryDisplay()
      const dock = where.length === 2 ? { mode: 'corner', side: where, displayId: d.id }
        : where === 'float' ? { mode: 'float', displayId: d.id } : { mode: 'edge', side: where, displayId: d.id }
      const mid = { x: d.workArea.x + d.workArea.width / 2, y: d.workArea.y + d.workArea.height / 2 }
      settle(dock, mid, { tucked: t === 'tuck', instant: true })
      if (process.env.BILLY_OPEN) setTimeout(() => billy.webContents.send('demo-open', process.env.BILLY_OPEN), 900)
      if (process.env.BILLY_CARD) setTimeout(() => showCard(process.env.BILLY_CARD), 1800)
      if (process.env.BILLY_ROOM) setTimeout(() => openRoom(process.env.BILLY_ROOM), 600)
      if (process.env.BILLY_DRAGTEST) setTimeout(() => dragTest().catch((e) => console.log('DRAGTEST ERROR', e.stack)), 900)
      // Test switch: BILLY_SNAP=<folder> saves each window's own pixels there, without
      // capturing the user's screen.
      if (process.env.BILLY_SNAP) setTimeout(async () => {
        for (const [name, w] of [['billy', billy], ['card', card], ['room', room]]) {
          if (!w || w.isDestroyed() || !w.isVisible()) continue
          const img = await w.webContents.capturePage()
          fs.writeFileSync(path.join(process.env.BILLY_SNAP, `snap_${name}.png`), img.toPNG())
        }
        if (process.env.BILLY_QUIT) app.quit()
      }, Number(process.env.BILLY_SNAP_AFTER || 3500))
    }, 600)
  })
}

/** Test switch: drags Billy around every screen through the real drag handlers and reports. */
async function dragTest() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const fake = { sender: billy.webContents }
  const results = []
  for (const d of screen.getAllDisplays()) {
    const wa = d.workArea
    const cases = [
      ['left edge, 60px off', { x: wa.x + 60, y: wa.y + wa.height / 2 }, 0],
      ['right edge, exactly on it', { x: wa.x + wa.width, y: wa.y + wa.height / 3 }, 0],
      ['top-left corner', { x: wa.x + 30, y: wa.y + 30 }, 0],
      ['bottom-right, far off screen', { x: wa.x + wa.width + 900, y: wa.y + wa.height + 900 }, 0],
      ['250px from left (should float)', { x: wa.x + 250, y: wa.y + wa.height / 2 }, 0],
      ['middle', { x: wa.x + wa.width / 2, y: wa.y + wa.height / 2 }, 0],
      ['flick toward bottom edge', { x: wa.x + wa.width / 2, y: wa.y + wa.height - 260 }, 3500],
      ['near the top, 40px from left corner zone', { x: wa.x + 140, y: wa.y + 20 }, 0],
    ]
    for (const [name, target, flick] of cases) {
      const c = billyCenter()
      ipcMain.emit('drag-start', fake, { sx: c.x, sy: c.y })
      const steps = 14
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        ipcMain.emit('drag-move', fake, { sx: c.x + (target.x - c.x) * t, sy: c.y + (target.y - c.y) * t + (flick && i > steps - 3 ? flick * 0.016 * (i - steps + 3) : 0) })
        await wait(16)
      }
      ipcMain.emit('drag-end', fake)
      await wait(1400)
      const b = billy.getBounds(), cc = billyCenter()
      const on = screen.getAllDisplays().find((x) => cc.x >= x.workArea.x && cc.x <= x.workArea.x + x.workArea.width && cc.y >= x.workArea.y && cc.y <= x.workArea.y + x.workArea.height)
      const wa2 = on?.workArea
      const winOn = wa2 && b.x >= wa2.x && b.y >= wa2.y && b.x + b.width <= wa2.x + wa2.width && b.y + b.height <= wa2.y + wa2.height
      const bodyOn = wa2 && cc.x - 58 >= wa2.x && cc.y - 58 >= wa2.y && cc.x + 58 <= wa2.x + wa2.width && cc.y + 58 <= wa2.y + wa2.height
      results.push({ display: d.id, name, bounds: [b.x, b.y, b.width, b.height], dock: place().dock.mode + (place().dock.side ? ':' + place().dock.side : ''), center: [Math.round(cc.x), Math.round(cc.y)], winOn: !!winOn, bodyOn: !!bodyOn })
    }
  }
  console.log('DRAGTEST ' + JSON.stringify(results))
  app.quit()
}

function createCard() {
  card = new BrowserWindow({
    width: CARD_W, height: 300, frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, focusable: false, show: false, backgroundColor: '#00000000', webPreferences,
  })
  card.setAlwaysOnTop(true, 'screen-saver')
  card.loadFile(path.join(DIST, 'card.html'))
}

function openRoom(section) {
  if (room) { room.show(); room.focus(); if (section) room.webContents.send('room-section', section); return }
  room = new BrowserWindow({
    width: 940, height: 640, minWidth: 820, minHeight: 560, frame: false, transparent: false, backgroundColor: '#f6f5f2',
    title: "Billy's room", show: false, webPreferences,
  })
  room.loadFile(path.join(DIST, 'room.html'), section ? { hash: section } : undefined)
  if (avatarIcon) room.setIcon(avatarIcon)
  room.once('ready-to-show', () => room.show())
  room.on('closed', () => { room = null })
}

function anchorOnScreen() { return billyCenter() }

let cardH = 300
function placeCard() {
  if (!card || !billy || !card.isVisible()) return
  const a = anchorOnScreen()
  const wa = screen.getDisplayNearestPoint({ x: Math.round(a.x), y: Math.round(a.y) }).workArea
  const d = place().dock || { mode: 'float' }
  const reach = 74      // just past Billy's pad
  let x, y
  if (d.mode === 'edge' && (d.side === 'top' || d.side === 'bottom')) {
    x = a.x - CARD_W / 2
    y = d.side === 'top' ? a.y + reach : a.y - reach - cardH
  } else {
    const toRight = d.mode === 'float' ? a.x < wa.x + wa.width / 2 : (d.side === 'left' || (d.side || '')[1] === 'l')
    x = toRight ? a.x + reach : a.x - reach - CARD_W
    y = d.mode === 'corner' ? ((d.side || '')[0] === 't' ? a.y - 40 : a.y + 40 - cardH) : a.y - cardH / 2
  }
  x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - CARD_W - 8)
  y = Math.min(Math.max(y, wa.y + 8), wa.y + wa.height - cardH - 8)
  card.setBounds({ x: Math.round(x) || 0, y: Math.round(y) || 0, width: CARD_W, height: Math.round(cardH) })
}

function showCard(uid) {
  cardFace = uid
  const f = faces.snapshot().find((s) => s.uid === uid)
  if (!f) return
  card.webContents.send('card', { face: f, side: cardSide(), color: store.get().look?.color })
  if (!card.isVisible()) { card.showInactive() }
  placeCard()
  billy.webContents.send('card-open', uid)
}
function hideCard() { if (card) card.hide(); cardFace = null; billy && billy.webContents.send('card-open', null) }
function cardSide() {
  const d = place().dock || {}
  if (d.mode === 'edge') return { left: 'left', right: 'right', top: 'top', bottom: 'bottom' }[d.side]
  if (d.mode === 'corner') return d.side[1] === 'l' ? 'left' : 'right'
  return 'left'
}

function pushAll() {
  const snap = faces.snapshot()
  const s = store.get()
  billy && billy.webContents.send('state', { faces: snap, look: s.look, pinned: s.pinned, quiet: s.quiet, sound: !process.env.BILLY_DEMO && s.sound !== false })
  if (card && cardFace) { const f = snap.find((x) => x.uid === cardFace); if (f) card.webContents.send('card', { face: f, side: cardSide(), color: store.get().look?.color }) }
  room && room.webContents.send('room-state', roomState())
}

function roomState() {
  const s = store.get()
  return { catalog: faces.catalog(), faces: faces.snapshot(), settings: { look: s.look, pinned: s.pinned, quiet: s.quiet, sound: s.sound !== false,
    onboarded: s.onboarded, startWithWindows: app.getLoginItemSettings(app.isPackaged ? undefined : { path: process.execPath, args: [app.getAppPath()] }).openAtLogin },
    pluginDir: faces.pluginDir() }
}

// ── volume: a long-lived PowerShell so Billy follows a hardware knob live ───────────────
let vol = null
const volWaiters = []
function volume(cmd) {
  if (process.platform !== 'win32') return Promise.resolve({ error: 'Volume is Windows-only for now' })
  if (!vol) {
    vol = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'native', 'volume.ps1').replace('app.asar', 'app.asar.unpacked')], { windowsHide: true })
    let buf = ''
    vol.stdout.on('data', (d) => {
      buf += d.toString()
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
        const w = volWaiters.shift()
        if (w) { try { w(JSON.parse(line)) } catch { w({ error: line }) } }
      }
    })
    vol.on('exit', () => { vol = null; while (volWaiters.length) volWaiters.shift()({ error: 'volume helper stopped' }) })
  }
  return new Promise((resolve) => { volWaiters.push(resolve); vol.stdin.write(cmd + '\n') })
}

// ── billy ipc ──────────────────────────────────────────────────────────────────────────
let drag = null
ipcMain.on('hit', (_e, over) => { if (billy) billy.setIgnoreMouseEvents(!over && !drag, { forward: true }) })
ipcMain.on('drag-start', (_e, { sx, sy }) => {
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
  clearInterval(anim)
  const c = billyCenter()
  drag = { gx: sx - c.x, gy: sy - c.y, moved: false, vx: 0, vy: 0, lt: 0, lx: c.x, ly: c.y }
  billy.setIgnoreMouseEvents(false)
  hideCard()
})
ipcMain.on('drag-move', (_e, { sx, sy }) => {
  if (!drag || !Number.isFinite(sx) || !Number.isFinite(sy)) return
  if (!drag.moved) {
    // Lifted off: Billy becomes a free drop, centred in his window, wherever he was.
    drag.moved = true
    const c = billyCenter()
    anchor = { x: SIZE / 2, y: SIZE / 2 }
    billy.webContents.send('dock', { mode: 'float', tucked: false, lifted: true, anchor, instant: true })
    moveTo(c.x - anchor.x, c.y - anchor.y)
    setPlace({ dock: { mode: 'float' }, tucked: false })
  }
  // Billy follows the pointer, held on a screen, pulled toward an edge he comes near.
  const p = geo.dragPoint(displays(), { x: sx - drag.gx, y: sy - drag.gy })
  const now = Date.now()
  if (drag.lt) {
    const dt = Math.max(1, now - drag.lt) / 1000
    drag.vx = drag.vx * 0.6 + ((p.x - drag.lx) / dt) * 0.4
    drag.vy = drag.vy * 0.6 + ((p.y - drag.ly) / dt) * 0.4
  }
  drag.lt = now; drag.lx = p.x; drag.ly = p.y
  if (!moveTo(p.x - anchor.x, p.y - anchor.y)) return
  // Where each pulling screen edge is inside the window, so the goo can reach for it.
  const [wx, wy] = [p.x - anchor.x, p.y - anchor.y]
  billy.webContents.send('near', p.near.map((n) => ({ side: n.side, strength: n.strength,
    at: n.side === 'left' || n.side === 'right' ? n.screen - wx : n.screen - wy })))
})
ipcMain.on('drag-end', () => {
  if (!drag) return
  const { moved } = drag
  const vx = Number.isFinite(drag.vx) ? drag.vx : 0, vy = Number.isFinite(drag.vy) ? drag.vy : 0
  drag = null
  if (!moved) return
  billy.webContents.send('near', [])
  const r = geo.decide(displays(), billyCenter(), { x: vx, y: vy })
  settle(r.dock, r.center, { velocity: { x: vx * 0.5, y: vy * 0.5 }, landed: r.dock.mode !== 'float', speed: Math.min(1, Math.hypot(vx, vy) / 2500) })
})
ipcMain.on('toggle-tuck', () => { const p = place(); if (p.dock && p.dock.mode !== 'float') applyDock(p.dock, !p.tucked) })
// Billy's own face is the app icon (taskbar, tray, window): snapshotted by the renderer.
let avatarIcon = null
ipcMain.on('set-icon', (_e, url) => {
  if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,') || url.length > 2_000_000) return
  const img = nativeImage.createFromDataURL(url)
  if (img.isEmpty()) return
  avatarIcon = img
  if (process.env.BILLY_SNAP) fs.writeFileSync(path.join(process.env.BILLY_SNAP, 'snap_icon.png'), img.toPNG())
  for (const w of [billy, card, room]) if (w && !w.isDestroyed()) w.setIcon(img)
  if (tray) tray.setImage(img.resize({ width: 32, height: 32, quality: 'best' }))
})
ipcMain.on('pin', (_e, uid) => { store.set({ pinned: uid }); pushAll() })
ipcMain.on('open-card', (_e, uid) => (cardFace === uid && card.isVisible() ? hideCard() : showCard(uid)))
ipcMain.on('close-card', () => hideCard())
ipcMain.on('open-room', (_e, section) => openRoom(section))
ipcMain.handle('volume', (_e, cmd) => volume(String(cmd).replace(/[^a-z0-9 .-]/gi, '')))

ipcMain.on('menu', (_e, uid) => {
  const s = store.get(), p = place()
  const list = faces.snapshot()
  const face = uid && list.find((f) => f.uid === uid)
  Menu.buildFromTemplate([
    ...(face ? [
      { label: face.name, enabled: false },
      { label: 'Show on Billy', type: 'checkbox', checked: s.pinned === uid, click: () => { store.set({ pinned: uid }); pushAll() } },
      { label: 'Refresh', click: () => faces.refresh(uid) },
      { label: 'Settings…', click: () => openRoom(`face:${uid}`) },
      { type: 'separator' },
    ] : []),
    ...(p.dock?.mode !== 'float' ? [{ label: p.tucked ? 'Come out' : 'Tuck away', click: () => applyDock(p.dock, !p.tucked) }] : []),
    { label: 'Come here  (Ctrl+Alt+B)', click: summon },
    { label: 'Snap sound', type: 'checkbox', checked: s.sound !== false, click: (m) => { store.set({ sound: m.checked }); pushAll() } },
    { label: 'Refresh everything', click: () => faces.refresh() },
    { type: 'separator' },
    { label: 'Add a face…', click: () => openRoom('add') },
    { label: "Billy's look…", click: () => openRoom('look') },
    { label: "Billy's room…", click: () => openRoom() },
    { type: 'separator' },
    { label: 'Quit Billy', click: () => app.quit() },
  ]).popup({ window: billy })
})

// ── card ipc ───────────────────────────────────────────────────────────────────────────
ipcMain.on('card-size', (_e, h) => { if (Number.isFinite(h)) { cardH = Math.min(Math.max(h, 120), 640); placeCard() } })
ipcMain.on('open-url', (_e, url) => { if (/^https:\/\//.test(url || '')) shell.openExternal(url) })
ipcMain.on('open-path', (_e, p) => { if (p && fs.existsSync(p)) shell.openPath(p) })
ipcMain.handle('act', async (_e, uid, id) => { try { await faces.act(uid, id); return { ok: true } } catch (e) { return { ok: false, error: e.message } } })

// ── room ipc ───────────────────────────────────────────────────────────────────────────
const uidFor = (type) => `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
ipcMain.handle('room-state', () => roomState())
ipcMain.handle('face-add', (_e, type, kind) => {
  const c = faces.registry().get(type)
  if (!c) return null
  const k = (c.kinds || []).find((x) => x.id === kind)
  const exists = store.get().faces.some((f) => f.type === type)
  if (exists && !c.multi) return store.get().faces.find((f) => f.type === type).uid
  const face = { uid: uidFor(type), type, name: k?.name || c.name, icon: k?.icon || c.icon, config: k ? { kind: k.id } : {} }
  store.set({ faces: [...store.get().faces, face] })
  faces.restart(); pushAll()
  return face.uid
})
ipcMain.handle('face-remove', (_e, uid) => {
  store.set({ faces: store.get().faces.filter((f) => f.uid !== uid), ...(store.get().pinned === uid ? { pinned: null } : {}) })
  store.dropSecrets(uid); faces.restart(); pushAll()
})
ipcMain.handle('face-update', (_e, uid, patch) => {
  const allowed = {}
  if (typeof patch.name === 'string') allowed.name = patch.name.slice(0, 24)
  if (typeof patch.icon === 'string') allowed.icon = patch.icon
  if (typeof patch.hidden === 'boolean') allowed.hidden = patch.hidden
  store.set({ faces: store.get().faces.map((f) => (f.uid === uid ? { ...f, ...allowed } : f)) }); pushAll()
})
ipcMain.handle('face-order', (_e, uids) => {
  const by = new Map(store.get().faces.map((f) => [f.uid, f]))
  store.set({ faces: uids.map((u) => by.get(u)).filter(Boolean) }); pushAll()
})
ipcMain.handle('fields-get', (_e, uid) => faces.fieldsOf(uid))
ipcMain.handle('fields-save', (_e, uid, values) => { try { faces.saveFields(uid, values); return { ok: true } } catch (e) { return { ok: false, error: e.message } } })
ipcMain.handle('face-connect', async (_e, uid) => { try { return { ok: true, message: await faces.connect(uid) } } catch (e) { return { ok: false, error: e.message } } })
ipcMain.handle('face-test', async (_e, uid) => { faces.refresh(uid); await new Promise((r) => setTimeout(r, 1500)); return faces.snapshot().find((f) => f.uid === uid) })
ipcMain.handle('settings-set', (_e, patch) => {
  const ok = {}
  if (patch.look) ok.look = { ...store.get().look, ...patch.look }
  if ('sound' in patch) ok.sound = !!patch.sound
  if (patch.quiet) ok.quiet = patch.quiet
  if ('pinned' in patch) ok.pinned = patch.pinned
  if ('onboarded' in patch) ok.onboarded = !!patch.onboarded
  // Run from source, Windows has to be told which app folder electron.exe should open.
  if ('startWithWindows' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.startWithWindows,
    ...(app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] }) })
  store.set(ok); pushAll()
})
ipcMain.handle('pick-file', async () => {
  const r = await dialog.showOpenDialog(room, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
  return r.canceled ? null : r.filePaths[0]
})
/** Copies an outreach kit (playbook, facts sheet, a starter state file) into a folder the user
 *  picks and points the face at it. */
ipcMain.handle('install-kit', async (_e, uid, template) => {
  if (!/^[a-z-]+$/.test(template)) return { ok: false, error: 'Unknown kit' }
  const src = path.join(__dirname, '..', 'examples', 'outreach', template)
  if (!fs.existsSync(src)) return { ok: false, error: 'Kit not found' }
  const r = await dialog.showOpenDialog(room, { title: 'Where should this outreach live?', properties: ['openDirectory', 'createDirectory'] })
  if (r.canceled) return { ok: false }
  const dest = r.filePaths[0]
  for (const f of fs.readdirSync(src)) {
    const to = path.join(dest, f)
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(src, f), to)    // never overwrite a running kit
  }
  const state = path.join(dest, 'billy_state.json')
  faces.saveFields(uid, { source: state })
  shell.openPath(dest)
  return { ok: true, dir: dest }
})
// ── guided outreach setup ──────────────────────────────────────────────────────────────
const outreach = require('./outreach_setup')
ipcMain.handle('outreach-setup-get', (_e, uid) => {
  const face = store.get().faces.find((f) => f.uid === uid)
  if (!face || face.type !== 'outreach') return null
  const kind = face.config?.kind === 'sales' ? 'sales' : 'round'
  const answers = face.config?.answers || {}
  const source = face.config?.source
  return {
    kind, answers, steps: outreach.STEPS[kind], confirmed: !!face.config?.confirmed, managed: !!face.config?.managed,
    folder: source ? path.dirname(source) : outreach.defaultFolder(app, kind, answers.company),
    command: 'claude -p "Follow PLAYBOOK.md in this folder for one run."',
    // The always-on runner ships unpacked beside the app (PowerShell cannot read inside app.asar).
    alwaysOn: `powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, '..', 'examples', 'outreach', 'runner', 'install.ps1').replace('app.asar', 'app.asar.unpacked')}" -Folder "${source ? path.dirname(source) : outreach.defaultFolder(app, kind, answers.company)}"`,
  }
})
ipcMain.handle('outreach-setup-save', (_e, uid, { answers, folder, confirmed }) => {
  try {
    const face = store.get().faces.find((f) => f.uid === uid)
    if (!face || face.type !== 'outreach') return { ok: false, error: 'Not an outreach face' }
    const kind = face.config?.kind === 'sales' ? 'sales' : 'round'
    const dir = folder || outreach.defaultFolder(app, kind, answers.company)
    const kitDir = path.join(__dirname, '..', 'examples', 'outreach', kind === 'round' ? 'investor-round' : 'sales-outreach')
    const source = outreach.apply({ kitDir, folder: dir, kind, answers, confirmed, managed: !!face.config?.managed })
    store.set({ faces: store.get().faces.map((f) => (f.uid === uid
      ? { ...f, config: { ...(f.config || {}), kind, answers, confirmed: !!confirmed, managed: true, source } } : f)) })
    faces.restart(); pushAll()
    return { ok: true, folder: dir }
  } catch (e) { return { ok: false, error: e.message } }
})
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(room, { properties: ['openDirectory', 'createDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.on('open-folder', (_e, p) => { if (p && fs.existsSync(p)) shell.openPath(p) })
ipcMain.on('copy-text', (_e, t) => { require('electron').clipboard.writeText(String(t || '')) })

ipcMain.on('open-plugins', () => { fs.mkdirSync(faces.pluginDir(), { recursive: true }); shell.openPath(faces.pluginDir()) })
ipcMain.on('reload-plugins', () => { faces.init({}); pushAll() })
ipcMain.on('room-close', () => room && room.close())
ipcMain.on('room-min', () => room && room.minimize())

// ── tray, shortcut, start ──────────────────────────────────────────────────────────────
function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(DIST, 'tray.png')))
  tray.setToolTip('Billy Boy')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Come here  (Ctrl+Alt+B)', click: summon },
    { label: "Billy's room…", click: () => openRoom() },
    { label: 'Refresh everything', click: () => faces.refresh() },
    { type: 'separator' },
    { label: 'Quit Billy', click: () => app.quit() },
  ]))
  tray.on('click', summon)
}

function summon() {
  if (!billy) return
  const p = screen.getCursorScreenPoint()
  settle({ mode: 'float' }, p)
  billy.showInactive()
}

if (!process.env.BILLY_DEMO && !app.requestSingleInstanceLock()) app.quit()
else app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('dev.billyboy.app')
  store.init(app, safeStorage)
  faces.init({
    onChange: () => pushAll(),
    openExternal: (u) => { if (/^https:\/\//.test(u)) shell.openExternal(u) },
    notify: (title, body) => { try { new Notification({ title, body, silent: false }).show() } catch {} ; billy && billy.webContents.send('nudge') },
    log: (...a) => logError('connector', a.join(' ')),
  })
  createBilly(); createCard(); buildTray()
  globalShortcut.register('Control+Alt+B', summon)
  screen.on('display-metrics-changed', () => {
    if (!billy || !placed || drag) return
    settle(place().dock || { mode: 'float' }, savedCenter(), { tucked: !!place().tucked, instant: true })
  })
  if (!store.get().onboarded && !process.env.BILLY_DEMO) setTimeout(() => openRoom('welcome'), 900)
})
app.on('second-instance', summon)
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (vol) vol.kill() })
app.on('window-all-closed', (e) => e.preventDefault())
