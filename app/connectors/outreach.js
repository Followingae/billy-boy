/**
 * Outreach: a fundraise or a sales push, run by an agent you schedule (Claude Code, a script,
 * anything) that writes one JSON file. Billy shows what is waiting on YOU: drafts to read and
 * send, replies, meetings, plus the goal and the funnel.
 *
 * Billy never sends. The agent writes drafts; you open each one and press send yourself.
 * See examples/outreach for the playbooks and the file format.
 */
const fs = require('fs')
const path = require('path')

async function read(src) {
  if (/^https:\/\//.test(src)) {
    const r = await fetch(src); if (!r.ok) throw new Error(`The state address answered ${r.status}`)
    return r.json()
  }
  return JSON.parse(fs.readFileSync(src, 'utf8'))
}

/** A suggestion's identity: the agent's own id if it gave one, else who it is about. */
const keyOf = (it) => String(it.id || it.who || it.title || '').trim().toLowerCase()
function readDismissed(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'dismissed.json'), 'utf8').replace(/^\uFEFF/, '')).dismissed || [] } catch { return [] }
}

function ago(iso) {
  const h = (Date.now() - new Date(iso)) / 3_600_000
  if (!Number.isFinite(h)) return ''
  if (h < 1) return 'updated just now'
  if (h < 24) return `updated ${Math.round(h)}h ago`
  return `updated ${Math.round(h / 24)}d ago`
}

module.exports = {
  id: 'outreach',
  name: 'Outreach',
  icon: 'rocket',
  blurb: 'A fundraise or a sales push. Your agent drafts, Billy tells you what to send, reply to and prepare for.',
  every: 30_000,
  multi: true,
  kinds: [
    { id: 'round', name: 'Round', icon: 'rocket', template: 'investor-round', title: 'Investor round',
      blurb: 'Your agent finds investors, drafts intros and follow-ups. Billy shows drafts to send, replies and meetings, and how much of the round is in.' },
    { id: 'sales', name: 'Sales', icon: 'handshake', template: 'sales-outreach', title: 'Sales outreach',
      blurb: 'Your agent finds buyers, drafts first touches and follow-ups. Billy shows drafts to send, replies, meetings and the pipeline.' },
  ],
  fields: [
    { key: 'source', label: 'State file', placeholder: 'C:\\...\\billy_state.json', type: 'file',
      help: 'The JSON file your outreach agent writes after every run. Or start from a kit: clear this field and two kit buttons appear.' },
    { key: 'stale', label: 'Warn if not updated for (hours)', placeholder: '30', type: 'number' },
  ],
  kit: true,
  async action(ctx, id) {
    if (!id.startsWith('dismiss:')) return
    const src = ctx.config.source
    if (!src || /^https:\/\//.test(src)) return
    const dir = path.dirname(src)
    const key = id.slice('dismiss:'.length)
    const list = readDismissed(dir)
    if (list.some((d) => d.key === key)) return
    let title = key
    try { title = (JSON.parse(fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '')).items || []).find((it) => keyOf(it) === key)?.title || key } catch {}
    list.push({ key, title, at: new Date().toISOString() })
    fs.writeFileSync(path.join(dir, 'dismissed.json'), JSON.stringify({ note: 'Suggestions the user rejected in Billy. Never suggest these again and never contact the people in them.', dismissed: list }, null, 2))
  },
  async poll(ctx) {
    const src = ctx.config.source
    if (!src) throw new Error('Choose the state file your agent writes.')
    const s = await read(src)
    // A kit's items can point at files beside the state file ("facts.md").
    const base = /^https:\/\//.test(src) ? null : path.dirname(src)
    const dismissed = base ? readDismissed(base) : []
    const gone = new Set(dismissed.map((d) => d.key))
    const items = (s.items || [])
      .map((it) => (it.path && base && !path.isAbsolute(it.path) ? { ...it, path: path.join(base, it.path) } : it))
      .map((it) => ({ ...it, key: keyOf(it), dismissable: !!base && !it.setup }))
      .filter((it) => !gone.has(it.key))
    // The always-on runner stamps `checked_at` on every check (even when nothing is new), so a
    // runner that stopped shows within an hour; without one, the agent's own `updated_at` counts.
    const beat = [s.checked_at, s.updated_at].filter(Boolean).sort().pop()
    const staleH = s.checked_at ? 1 : Number(ctx.config.stale) || 30
    const stale = beat && (Date.now() - new Date(beat)) / 3_600_000 > staleH
    if (stale) items.unshift({ title: 'The agent has not run lately', subtitle: `Last ${ago(beat)}. Is the PC on and the runner installed?`, urgency: 'warn' })
    const count = s.count ?? items.length
    return {
      value: s.value != null ? String(s.value) : String(count),
      caption: s.caption || 'waiting on you',
      urgency: stale && s.urgency === 'calm' ? 'warn' : s.urgency || (count ? 'warn' : 'calm'),
      count, items,
      goal: s.goal || (s.progress != null ? { done: s.progress, target: 1, label: s.caption } : null),
      funnel: s.funnel || null,
      inbox: s.inbox || null,
      meetings: s.meetings || null,
      updated: s.runner && s.checked_at ? `${s.runner}, ${ago(s.checked_at).replace('updated ', '')}` : beat ? ago(beat) : null,
    }
  },
}
