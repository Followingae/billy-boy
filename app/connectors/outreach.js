/**
 * Outreach: a fundraise or a sales push, run by an agent you schedule (Claude Code, a script,
 * anything) that writes one JSON file. Billy shows what is waiting on YOU: drafts to send and
 * meetings, plus the goal and the funnel.
 *
 * Billy never sends, and nor does the agent: it only writes drafts. Click a draft on Billy to open
 * it; outside its send window Billy says when to schedule it (Gmail: arrow next to Send, then
 * Schedule send), so you can deal with it any time and it still lands at a good hour. Drafts you
 * send, schedule or delete drop off Billy on the runner's next check (a deleted draft counts as
 * "don't chase this one"). See examples/outreach for playbooks and file format.
 */
const fs = require('fs')
const path = require('path')

async function read(src) {
  if (/^https:\/\//.test(src)) {
    const r = await fetch(src); if (!r.ok) throw new Error(`The state address answered ${r.status}`)
    return r.json()
  }
  return JSON.parse(fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, ''))
}

/** A suggestion's identity: the agent's own id if it gave one, else who it is about. */
const keyOf = (it) => String(it.id || it.who || it.title || '').trim().toLowerCase()
/** The Gmail draft behind an item: given, or read from its compose link ("msg-a:r123..."). */
const draftOf = (it) => it.draftId || ((it.url || '').match(/msg-a:(r-?\d+)/) || [])[1] || null

function readJson(dir, name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function readDismissed(dir) { return readJson(dir, 'dismissed.json', {}).dismissed || [] }
/*
 * Send windows. A draft goes out only at a good time:
 *   first emails and follow-ups   working days, work hours (default Mon to Fri, 9:00 to 18:00)
 *   replies                       working days, until a later hour (default 22:00)
 * Items say which they are with `send: "first" | "followup" | "reply"`.
 */
const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
function windowsOf(config) {
  const days = String(config.workDays || 'mon-fri').toLowerCase()
  const set = new Set()
  for (const part of days.split(',')) {
    const [a, b] = part.trim().split('-').map((d) => DAYS[d.slice(0, 3)])
    if (a == null) continue
    if (b == null) set.add(a)
    else for (let d = a; ; d = (d + 1) % 7) { set.add(d); if (d === b) break }
  }
  return { days: set, start: Number(config.workStart ?? 9), end: Number(config.workEnd ?? 18), replyEnd: Number(config.replyEnd ?? 22) }
}
function inWindow(w, kind, now = new Date()) {
  if (!w.days.has(now.getDay())) return false
  const h = now.getHours() + now.getMinutes() / 60
  return h >= w.start && h < (kind === 'reply' ? w.replyEnd : w.end)
}
function nextOpen(w, kind, now = new Date()) {
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i); d.setHours(w.start, 0, 0, 0)
    if (!w.days.has(d.getDay())) continue
    if (i === 0 && inWindow(w, kind, now)) return now
    if (d > now) return d
  }
  return null
}
const whenLabel = (d, now = new Date()) => {
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  return sameDay ? `at ${t}` : d.toDateString() === tomorrow.toDateString() ? `tomorrow ${t}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${t}`
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
  blurb: 'A fundraise or a sales push. Your agent drafts; Billy tells you what to send and when to schedule it.',
  every: 30_000,
  multi: true,
  kinds: [
    { id: 'round', name: 'Round', icon: 'rocket', template: 'investor-round', title: 'Investor round',
      blurb: 'Your agent finds investors and drafts intros and follow-ups. Billy shows what to send and when.' },
    { id: 'sales', name: 'Sales', icon: 'handshake', template: 'sales-outreach', title: 'Sales outreach',
      blurb: 'Your agent finds buyers and drafts first touches and follow-ups. Billy shows what to send and when.' },
  ],
  fields: [
    { key: 'source', label: 'State file', placeholder: 'C:\\...\\billy_state.json', type: 'file',
      help: 'The JSON file your outreach agent writes after every run. Or start from a kit: clear this field and two kit buttons appear.' },
    { key: 'stale', label: 'Warn if not updated for (hours)', placeholder: '30', type: 'number' },
    { key: 'workDays', label: 'Working days', placeholder: 'mon-fri', help: 'When first emails and follow-ups go out, e.g. mon-fri or sun-thu.' },
    { key: 'workStart', label: 'Work hours start', placeholder: '9', type: 'number' },
    { key: 'workEnd', label: 'Work hours end', placeholder: '18', type: 'number' },
    { key: 'replyEnd', label: 'Replies can go out until', placeholder: '22', type: 'number' },
  ],
  kit: true,
  async action(ctx, id) {
    const src = ctx.config.source
    if (!src || /^https:\/\//.test(src)) return
    const dir = path.dirname(src)
    const [verb, ...rest] = id.split(':')
    const key = rest.join(':')
    let state = {}
    try { state = await read(src) } catch {}
    const item = (state.items || []).find((it) => keyOf(it) === key)

    if (verb === 'dismiss') {
      const list = readDismissed(dir)
      if (list.some((d) => d.key === key)) return
      list.push({ key, title: item?.title || key, who: item?.who, at: new Date().toISOString() })
      fs.writeFileSync(path.join(dir, 'dismissed.json'), JSON.stringify({ note: 'Suggestions the user rejected in Billy. Never suggest these again and never contact the people in them.', dismissed: list }, null, 2))
    }

  },
  async poll(ctx) {
    const src = ctx.config.source
    if (!src) throw new Error('Choose the state file your agent writes.')
    const s = await read(src)
    // A kit's items can point at files beside the state file ("facts.md").
    const base = /^https:\/\//.test(src) ? null : path.dirname(src)
    const gone = new Set((base ? readDismissed(base) : []).map((d) => d.key))
    const w = windowsOf(ctx.config)
    const items = (s.items || [])
      .map((it) => (it.path && base && !path.isAbsolute(it.path) ? { ...it, path: path.join(base, it.path) } : it))
      .map((it) => ({ ...it, key: keyOf(it), dismissable: !!base && !it.setup }))
      .filter((it) => !gone.has(it.key))
      .map((it) => {
        if (!it.send || inWindow(w, it.send)) return it
        const at = nextOpen(w, it.send)
        // Outside its window a draft still shows, calmly, with the time to schedule it for.
        return { ...it, urgency: 'calm', quiet: true, hint: at ? `schedule it for ${whenLabel(at)}` : 'ready' }
      })
    // The always-on runner stamps `checked_at` on every check (even when nothing is new), so a
    // runner that stopped shows within an hour; without one, the agent's own `updated_at` counts.
    const beat = [s.checked_at, s.updated_at].filter(Boolean).sort().pop()
    const staleH = s.checked_at ? 1 : Number(ctx.config.stale) || 30
    const stale = beat && (Date.now() - new Date(beat)) / 3_600_000 > staleH
    if (stale) items.unshift({ title: 'The agent has not run lately', subtitle: `Last ${ago(beat)}. Is the PC on and the runner installed?`, urgency: 'warn' })
    // Billy's number: drafts still waiting for your Send, plus meetings. Approved ones are done.
    const count = items.filter((it) => !/^The agent/.test(it.title)).length
    return {
      value: String(count),
      caption: count ? 'to send or schedule' : 'all sent or scheduled',
      urgency: stale ? 'warn' : items.some((it) => it.urgency === 'alert') ? 'alert' : count ? 'warn' : 'calm',
      count, items,
      goal: s.goal || (s.progress != null ? { done: s.progress, target: 1, label: s.caption } : null),
      funnel: s.funnel || null,
      inbox: s.inbox || null,
      meetings: s.meetings || null,
      updated: s.runner && s.checked_at ? `${s.runner}, ${ago(s.checked_at).replace('updated ', '')}` : beat ? ago(beat) : null,
    }
  },
}
