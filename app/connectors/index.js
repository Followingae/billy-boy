/**
 * The faces engine. Every face is an instance of a connector (a module with `poll`), with its
 * own config and its own encrypted secrets. Built-in connectors live next to this file;
 * plugins are loaded from <app data>/plugins/<name>/index.js, so private ones never sit in
 * the repo.
 */
const fs = require('fs')
const path = require('path')
const store = require('../store')

const BUILTIN = ['volume', 'outreach', 'spotify', 'calendar', 'mail', 'github', 'weather', 'focus', 'json']
  .map((n) => require(`./${n}`))

let registry = new Map()
let results = new Map()       // uid -> { result, error, at }
let memos = new Map()         // uid -> scratch space a connector keeps between polls
let timers = new Map()
let hooks = { onChange: () => {}, openExternal: () => {}, notify: () => {}, log: () => {} }

function pluginDir() { return path.join(store.userDir(), 'plugins') }

function loadPlugins() {
  const found = []
  const dirs = [pluginDir(), path.join(__dirname, '..', '..', 'plugins.local')]
  for (const dir of dirs) {
    let names = []
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const name of names) {
      const entry = path.join(dir, name, 'index.js')
      if (!fs.existsSync(entry)) continue
      try {
        delete require.cache[require.resolve(entry)]
        const mod = require(entry)
        if (mod && mod.id && typeof mod.poll === 'function') found.push({ ...mod, plugin: true })
      } catch (e) { hooks.log('plugin ' + name, e) }
    }
  }
  return found
}

function init(h) {
  hooks = { ...hooks, ...h }
  registry = new Map([...BUILTIN, ...loadPlugins()].map((c) => [c.id, c]))
  restart()
}

function catalog() {
  return [...registry.values()].map((c) => ({
    id: c.id, name: c.name, icon: c.icon, blurb: c.blurb, multi: !!c.multi, kinds: c.kinds || null, kit: !!c.kit,
    fields: (c.fields || []).map(({ key, label, placeholder, help, secret, type, options }) => ({ key, label, placeholder, help, secret: !!secret, type, options })),
    canConnect: typeof c.connect === 'function', copy: c.copy || null, plugin: !!c.plugin, builtin: !!c.builtin,
  }))
}

function ctxFor(face) {
  const uid = face.uid
  if (!memos.has(uid)) memos.set(uid, {})
  return {
    uid,
    config: face.config || {},
    memo: memos.get(uid),
    secret: (k) => store.secret(uid, k),
    setSecret: (k, v) => store.setSecret(uid, k, v),
    // One sign-in shared by every face of the same connector (e.g. four faces, one account).
    shared: (k) => store.secret(`type:${face.type}`, k),
    setShared: (k, v) => store.setSecret(`type:${face.type}`, k, v),
    openExternal: (u) => hooks.openExternal(u),
    notify: (title, body) => hooks.notify(title, body),
    log: (...a) => hooks.log(face.type, ...a),
  }
}

function faceOf(uid) { return (store.get().faces || []).find((f) => f.uid === uid) }

async function pollOne(face) {
  const c = registry.get(face.type)
  if (!c || !c.poll) return
  try {
    const result = await c.poll(ctxFor(face))
    results.set(face.uid, { result, error: null, at: Date.now() })
  } catch (e) {
    results.set(face.uid, { result: results.get(face.uid)?.result || null, error: e.message || String(e), at: Date.now() })
  }
  hooks.onChange(snapshot())
}

function restart() {
  for (const t of timers.values()) clearInterval(t)
  timers.clear()
  for (const face of store.get().faces || []) {
    const c = registry.get(face.type)
    if (!c || !c.poll) continue
    pollOne(face)
    timers.set(face.uid, setInterval(() => { const f = faceOf(face.uid); if (f) pollOne(f) }, Math.max(1000, c.every || 60_000)))
  }
  hooks.onChange(snapshot())
}

function refresh(uid) {
  const list = uid ? [faceOf(uid)].filter(Boolean) : store.get().faces || []
  list.forEach(pollOne)
}

function snapshot() {
  return (store.get().faces || []).map((f) => {
    const c = registry.get(f.type)
    const r = results.get(f.uid) || {}
    const ctx = ctxFor(f)
    return {
      uid: f.uid, type: f.type, name: f.name || c?.name || f.type, icon: f.icon || c?.icon || 'puzzle', hidden: !!f.hidden,
      missing: !c, builtin: !!c?.builtin,
      connected: c?.connected ? !!c.connected(ctx) : true,
      result: r.result || null, error: r.error || null, at: r.at || null,
    }
  })
}

async function act(uid, actionId) {
  const face = faceOf(uid); const c = face && registry.get(face.type)
  if (!c?.action) return
  await c.action(ctxFor(face), actionId)
  setTimeout(() => pollOne(faceOf(uid)), 350)
}

async function connect(uid) {
  const face = faceOf(uid); const c = face && registry.get(face.type)
  if (!c?.connect) throw new Error('Nothing to connect')
  const msg = await c.connect(ctxFor(face))
  pollOne(faceOf(uid))
  return msg
}

/** Field values for the room: plain config as is, secrets only as "set" or not. */
function fieldsOf(uid) {
  const face = faceOf(uid); const c = face && registry.get(face.type)
  if (!c) return {}
  const out = {}
  for (const f of c.fields || []) out[f.key] = f.secret ? (store.hasSecret(uid, f.key) ? '__set__' : '') : (face.config?.[f.key] ?? '')
  return out
}

function saveFields(uid, values) {
  const faces = store.get().faces.map((face) => {
    if (face.uid !== uid) return face
    const c = registry.get(face.type)
    const config = { ...(face.config || {}) }
    for (const f of c?.fields || []) {
      if (!(f.key in values)) continue
      if (f.secret) { if (values[f.key] !== '__set__') store.setSecret(uid, f.key, values[f.key] || null) }
      else config[f.key] = values[f.key]
    }
    return { ...face, config }
  })
  store.set({ faces })
  memos.delete(uid)
  restart()
}

module.exports = { init, catalog, snapshot, refresh, restart, act, connect, fieldsOf, saveFields, pluginDir, registry: () => registry }
