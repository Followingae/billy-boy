/**
 * Where Billy keeps things. Two files in the user's own app-data folder, never in the repo:
 *   settings.json   faces, their (non-secret) config, Billy's look, where he sits
 *   secrets.bin     tokens and passwords, encrypted with the operating system's key
 *                   (Windows DPAPI via Electron safeStorage), readable only by this user
 *                   on this machine
 * A fork of the repo starts with neither, so nobody's accounts travel with the code.
 */
const fs = require('fs')
const path = require('path')

let dir = null
let safe = null
let settings = null
let secrets = {}

const DEFAULTS = {
  look: { type: 'droid', color: '#ff8a3d', hat: 'none', shading: 'fabric' },
  faces: [
    { uid: 'volume', type: 'volume', name: 'Volume', icon: 'volume' },
    { uid: 'weather', type: 'weather', name: 'Weather', icon: 'weather', config: { place: 'Dubai' } },
    { uid: 'focus', type: 'focus', name: 'Focus', icon: 'focus', config: { minutes: 25 } },
  ],
  pinned: 'volume',
  place: { x: null, y: null, dock: { mode: 'float' }, tucked: false },
  sound: true,
  quiet: { from: 23, to: 7 },
  onboarded: false,
}

function init(app, safeStorage) {
  dir = app.getPath('userData')
  safe = safeStorage
  // replace(BOM): a settings file saved by Windows tools can start with one, and JSON.parse
  // would then fail and Billy would start from defaults, forgetting everything.
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8').replace(/^﻿/, '')) } }
  catch { settings = structuredClone(DEFAULTS) }
  try {
    const raw = fs.readFileSync(path.join(dir, 'secrets.bin'))
    secrets = JSON.parse(safe.isEncryptionAvailable() ? safe.decryptString(raw) : '{}')
  } catch { secrets = {} }
}

function get() { return settings }
function set(patch) { settings = { ...settings, ...patch }; save() }
function save() {
  try { fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2)) } catch {}
}

function secret(uid, key) { return secrets[uid]?.[key] ?? null }
function setSecret(uid, key, value) {
  if (!safe.isEncryptionAvailable()) throw new Error('This machine cannot encrypt secrets, so Billy will not store them.')
  secrets[uid] = { ...(secrets[uid] || {}) }
  if (value == null || value === '') delete secrets[uid][key]
  else secrets[uid][key] = value
  fs.writeFileSync(path.join(dir, 'secrets.bin'), safe.encryptString(JSON.stringify(secrets)))
}
function hasSecret(uid, key) { return !!secrets[uid]?.[key] }
function dropSecrets(uid) { delete secrets[uid]; try { fs.writeFileSync(path.join(dir, 'secrets.bin'), safe.encryptString(JSON.stringify(secrets))) } catch {} }

function userDir() { return dir }

module.exports = { init, get, set, save, secret, setSecret, hasSecret, dropSecrets, userDir }
