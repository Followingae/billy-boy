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

app.setPath('userData', path.join(app.getPath('appData'), 'billy-boy'))
const store = require('./store')
const faces = require('./connectors')

const SIZE = 420          // the billy window square
const SNAP = 64           // how close to an edge counts as dropped on it
const PULL_ZONE = 150     // within this distance an edge starts to pull Billy in
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
function dockFor(x, y) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x + SIZE / 2), y: Math.round(y + SIZE / 2) })
  const wa = display.workArea
  const h = x - wa.x < SNAP ? 'l' : wa.x + wa.width - (x + SIZE) < SNAP ? 'r' : null
  const v = y - wa.y < SNAP ? 't' : wa.y + wa.height - (y + SIZE) < SNAP ? 'b' : null
  if (h && v) return { mode: 'corner', side: v + h, displayId: display.id }
  if (h) return { mode: 'edge', side: h === 'l' ? 'left' : 'right', displayId: display.id }
  if (v) return { mode: 'edge', side: v === 't' ? 'top' : 'bottom', displayId: display.id }
  return { mode: 'float', displayId: display.id }
}

function targetFor(dock, x, y) {
  const display = screen.getAllDisplays().find((d) => d.id === dock.displayId)
    || screen.getDisplayNearestPoint({ x: Math.round(x + SIZE / 2), y: Math.round(y + SIZE / 2) })
  const wa = display.workArea
  let nx = Math.min(Math.max(x, wa.x), wa.x + wa.width - SIZE)
  let ny = Math.min(Math.max(y, wa.y), wa.y + wa.height - SIZE)
  const s = dock.side || ''
  if (dock.mode === 'edge') {
    if (s === 'left') nx = wa.x
    if (s === 'right') nx = wa.x + wa.width - SIZE
    if (s === 'top') ny = wa.y
    if (s === 'bottom') ny = wa.y + wa.height - SIZE
  } else if (dock.mode === 'corner') {
    nx = s[1] === 'l' ? wa.x : wa.x + wa.width - SIZE
    ny = s[0] === 't' ? wa.y : wa.y + wa.height - SIZE
  }
  return { x: Math.round(nx), y: Math.round(ny) }
}

/** Where Billy's centre sits inside the square for a dock. The renderer uses the same rule. */
function anchorFor(dock, tucked) {
  const m = tucked ? 16 : 64
  const c = SIZE / 2, far = SIZE - m
  if (!dock || dock.mode === 'float') return { x: c, y: c }
  const s = dock.side
  if (dock.mode === 'edge') return { left: { x: m, y: c }, right: { x: far, y: c }, top: { x: c, y: m }, bottom: { x: c, y: far } }[s]
  return { x: s[1] === 'l' ? m : far, y: s[0] === 't' ? m : far }
}

function moveTo(x, y) {
  if (!billy || !Number.isFinite(x) || !Number.isFinite(y)) { logError('moveTo', new Error(`refused ${x}, ${y}`)); return false }
  // `|| 0` turns -0 into 0: a spring overshooting an edge at 0 rounds to -0, and Electron
  // rejects -0 as a window coordinate ("conversion failure").
  billy.setPosition(Math.round(x) || 0, Math.round(y) || 0)
  return true
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

function applyDock(dock, tucked = false, velocity = null, landed = false, speed = 0) {
  const [x, y] = billy.getPosition()
  const t = targetFor(dock, x, y)
  const tk = dock.mode === 'float' ? false : tucked
  setPlace({ dock, tucked: tk, x: t.x, y: t.y })
  glideTo(t.x, t.y, velocity || { x: 0, y: 0 })
  billy.webContents.send('dock', { ...dock, tucked: tk, landed, speed })
  debug('dock', dock, tk)
}

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
    const p = place()
    const prim = screen.getPrimaryDisplay()
    const onScreen = p.x != null && screen.getAllDisplays().some((d) => {
      const b = d.workArea
      return p.x >= b.x - 1 && p.y >= b.y - 1 && p.x + SIZE <= b.x + b.width + 1 && p.y + SIZE <= b.y + b.height + 1
    })
    if (!onScreen) {
      const wa = prim.workArea
      setPlace({ x: wa.x + wa.width - SIZE, y: wa.y + wa.height - SIZE, dock: { mode: 'corner', side: 'br', displayId: prim.id }, tucked: false })
    }
    const q = place()
    billy.setPosition(q.x, q.y)
    billy.showInactive()
    placed = true
    pushAll()
    billy.webContents.send('dock', { ...(q.dock || { mode: 'float' }), tucked: !!q.tucked })
    const demo = process.env.BILLY_DEMO        // test switch: BILLY_DEMO=tl, left, float, right-tuck
    if (demo) setTimeout(() => {
      const [where, t] = demo.split('-')
      const d = screen.getPrimaryDisplay()
      const dock = where.length === 2 ? { mode: 'corner', side: where, displayId: d.id }
        : where === 'float' ? { mode: 'float', displayId: d.id } : { mode: 'edge', side: where, displayId: d.id }
      billy.setPosition(d.workArea.x + Math.round(d.workArea.width / 2) - SIZE / 2, d.workArea.y + Math.round(d.workArea.height / 2) - SIZE / 2)
      applyDock(dock, t === 'tuck')
      if (process.env.BILLY_OPEN) setTimeout(() => billy.webContents.send('demo-open', process.env.BILLY_OPEN), 900)
      if (process.env.BILLY_CARD) setTimeout(() => showCard(process.env.BILLY_CARD), 1800)
      if (process.env.BILLY_ROOM) setTimeout(() => openRoom(process.env.BILLY_ROOM), 600)
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
  room.once('ready-to-show', () => room.show())
  room.on('closed', () => { room = null })
}

function anchorOnScreen() {
  const [x, y] = billy.getPosition()
  const a = anchorFor(place().dock, place().tucked)
  return { x: x + a.x, y: y + a.y }
}

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
  card.webContents.send('card', { face: f, side: cardSide() })
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
  billy && billy.webContents.send('state', { faces: snap, look: s.look, pinned: s.pinned, quiet: s.quiet, sound: s.sound !== false })
  if (card && cardFace) { const f = snap.find((x) => x.uid === cardFace); if (f) card.webContents.send('card', { face: f, side: cardSide() }) }
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
  const [x, y] = billy.getPosition()
  clearInterval(anim)
  drag = { ox: sx - x, oy: sy - y, moved: false, vx: 0, vy: 0, lt: 0, lx: x, ly: y }
  billy.setIgnoreMouseEvents(false)
  hideCard()
})
ipcMain.on('drag-move', (_e, { sx, sy }) => {
  if (!drag || !Number.isFinite(sx) || !Number.isFinite(sy)) return
  if (!drag.moved) {
    drag.moved = true
    setPlace({ dock: { mode: 'float' }, tucked: false })
    billy.webContents.send('dock', { mode: 'float', tucked: false, lifted: true })
  }
  const rx = sx - drag.ox, ry = sy - drag.oy
  const now = Date.now()
  if (drag.lt) {
    const dt = Math.max(1, now - drag.lt) / 1000
    drag.vx = drag.vx * 0.6 + ((rx - drag.lx) / dt) * 0.4
    drag.vy = drag.vy * 0.6 + ((ry - drag.ly) / dt) * 0.4
  }
  drag.lt = now; drag.lx = rx; drag.ly = ry
  // Magnetism, measured from Billy (not the square): the nearest edge or corner pulls harder
  // the closer he gets, and he starts to melt toward it before he is let go.
  const wa = screen.getDisplayNearestPoint({ x: Math.round(rx + SIZE / 2), y: Math.round(ry + SIZE / 2) }).workArea
  const dl = rx - wa.x, dr = wa.x + wa.width - (rx + SIZE), dtp = ry - wa.y, db = wa.y + wa.height - (ry + SIZE)
  const nearX = Math.min(dl, dr), nearY = Math.min(dtp, db)
  const ease = (t) => t * t * (3 - 2 * t)
  const sx2 = Math.max(0, 1 - nearX / PULL_ZONE), sy2 = Math.max(0, 1 - nearY / PULL_ZONE)
  const px = sx2 > 0 ? (dl < dr ? wa.x : wa.x + wa.width - SIZE) : rx
  const py = sy2 > 0 ? (dtp < db ? wa.y : wa.y + wa.height - SIZE) : ry
  if (!moveTo(rx + (px - rx) * ease(sx2) * 0.45, ry + (py - ry) * ease(sy2) * 0.45)) return
  const h = sx2 > 0 ? (dl < dr ? 'l' : 'r') : null
  const v = sy2 > 0 ? (dtp < db ? 't' : 'b') : null
  billy.webContents.send('near', {
    mode: h && v ? 'corner' : (h || v) ? 'edge' : 'float',
    side: h && v ? v + h : h ? (h === 'l' ? 'left' : 'right') : v ? (v === 't' ? 'top' : 'bottom') : null,
    strength: Math.max(ease(sx2), ease(sy2)),
  })
})
ipcMain.on('drag-end', () => {
  if (!drag) return
  const { moved } = drag
  const vx = Number.isFinite(drag.vx) ? drag.vx : 0, vy = Number.isFinite(drag.vy) ? drag.vy : 0
  drag = null
  if (!moved) return
  const [x, y] = billy.getPosition()
  const dock = dockFor(x + vx * 0.12, y + vy * 0.12)      // a flick carries
  applyDock(dock, false, { x: vx * 0.6, y: vy * 0.6 }, dock.mode !== 'float', Math.min(1, Math.hypot(vx, vy) / 2500))
})
ipcMain.on('toggle-tuck', () => { const p = place(); if (p.dock && p.dock.mode !== 'float') applyDock(p.dock, !p.tucked) })
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
  const d = screen.getDisplayNearestPoint(p)
  const dock = { mode: 'float', displayId: d.id }
  billy.webContents.send('dock', { mode: 'float', tucked: false })
  const t = targetFor(dock, p.x - SIZE / 2, p.y - SIZE / 2)
  setPlace({ dock, tucked: false, x: t.x, y: t.y })
  glideTo(t.x, t.y)
  billy.showInactive()
}

if (!app.requestSingleInstanceLock()) app.quit()
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
    applyDock(place().dock || { mode: 'float' }, place().tucked)
  })
  if (!store.get().onboarded && !process.env.BILLY_DEMO) setTimeout(() => openRoom('welcome'), 900)
})
app.on('second-instance', summon)
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (vol) vol.kill() })
app.on('window-all-closed', (e) => e.preventDefault())
