/**
 * Spotify: what is playing, and play / pause / skip from Billy.
 * Sign-in is OAuth with PKCE against YOUR OWN Spotify app (a free developer app takes a
 * minute), so no client secret exists anywhere and a fork never shares a key.
 */
const http = require('http')
const crypto = require('crypto')

const PORT = 43821
const REDIRECT = `http://127.0.0.1:${PORT}/callback`
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing'

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function token(ctx) {
  const t = ctx.secret('access')
  if (t && Number(ctx.secret('expires') || 0) > Date.now() + 30_000) return t
  const refresh = ctx.secret('refresh')
  if (!refresh) throw new Error('Not connected yet. Press Connect.')
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: ctx.config.clientId }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description || 'Spotify refused the saved sign-in. Connect again.')
  ctx.setSecret('access', j.access_token)
  ctx.setSecret('expires', String(Date.now() + j.expires_in * 1000))
  if (j.refresh_token) ctx.setSecret('refresh', j.refresh_token)
  return j.access_token
}

async function api(ctx, method, p) {
  const r = await fetch(`https://api.spotify.com/v1${p}`, { method, headers: { Authorization: `Bearer ${await token(ctx)}` } })
  if (r.status === 204) return null
  if (r.status === 403 && method !== 'GET') throw new Error('Spotify Premium is needed to control playback.')
  if (!r.ok) throw new Error(`Spotify said ${r.status}`)
  return r.json()
}

module.exports = {
  id: 'spotify',
  name: 'Spotify',
  icon: 'music',
  blurb: 'What is playing. Play, pause and skip without leaving what you are doing.',
  every: 4000,
  fields: [
    { key: 'clientId', label: 'Client ID', placeholder: 'from developer.spotify.com/dashboard',
      help: `Create an app at developer.spotify.com/dashboard, add the redirect URI ${REDIRECT}, tick "Web API", then paste its Client ID here.` },
  ],
  copy: REDIRECT,

  async connect(ctx) {
    if (!ctx.config.clientId) throw new Error('Paste your Client ID first.')
    const verifier = b64url(crypto.randomBytes(48))
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
    const stateTok = b64url(crypto.randomBytes(16))
    const code = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const u = new URL(req.url, REDIRECT)
        if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return }
        const ok = u.searchParams.get('state') === stateTok && u.searchParams.get('code')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<body style="font:16px system-ui;display:grid;place-items:center;height:90vh">${ok ? 'Billy is connected to Spotify. You can close this tab.' : 'That did not work. Try Connect again.'}</body>`)
        server.close()
        ok ? resolve(ok) : reject(new Error(u.searchParams.get('error') || 'Spotify sign-in was cancelled.'))
      })
      server.on('error', reject)
      server.listen(PORT, '127.0.0.1', () => {
        ctx.openExternal('https://accounts.spotify.com/authorize?' + new URLSearchParams({
          response_type: 'code', client_id: ctx.config.clientId, scope: SCOPES, redirect_uri: REDIRECT,
          code_challenge_method: 'S256', code_challenge: challenge, state: stateTok,
        }))
      })
      setTimeout(() => { server.close(); reject(new Error('Timed out waiting for Spotify.')) }, 180_000)
    })
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: ctx.config.clientId, code_verifier: verifier }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error_description || 'Spotify would not finish the sign-in.')
    ctx.setSecret('access', j.access_token)
    ctx.setSecret('refresh', j.refresh_token)
    ctx.setSecret('expires', String(Date.now() + j.expires_in * 1000))
    return 'Connected'
  },

  connected: (ctx) => !!ctx.secret('refresh'),

  async poll(ctx) {
    const p = await api(ctx, 'GET', '/me/player')
    if (!p || !p.item) return { value: '', caption: 'Nothing playing', urgency: 'calm', playing: false,
      actions: [{ id: 'play', label: 'Play', icon: 'play' }] }
    const t = p.item
    const artists = (t.artists || t.show && [t.show] || []).map((a) => a.name).join(', ')
    return {
      value: '', caption: `${t.name} · ${artists}`, urgency: 'calm', playing: !!p.is_playing,
      art: t.album?.images?.slice(-1)[0]?.url || t.album?.images?.[0]?.url || null,
      progress: t.duration_ms ? p.progress_ms / t.duration_ms : 0,
      items: [{ title: t.name, subtitle: artists, meta: t.album?.name || '', url: t.external_urls?.spotify, art: t.album?.images?.[0]?.url }],
      actions: [
        { id: 'prev', label: 'Previous', icon: 'prev' },
        { id: p.is_playing ? 'pause' : 'play', label: p.is_playing ? 'Pause' : 'Play', icon: p.is_playing ? 'pause' : 'play' },
        { id: 'next', label: 'Next', icon: 'next' },
      ],
    }
  },

  async action(ctx, id) {
    if (id === 'play') await api(ctx, 'PUT', '/me/player/play')
    if (id === 'pause') await api(ctx, 'PUT', '/me/player/pause')
    if (id === 'next') await api(ctx, 'POST', '/me/player/next')
    if (id === 'prev') await api(ctx, 'POST', '/me/player/previous')
  },
}
