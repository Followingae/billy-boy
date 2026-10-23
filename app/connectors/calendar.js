/**
 * Calendar from a private iCal (ICS) address. Google, Outlook and Apple all give one, so no
 * OAuth app is needed. The address is a secret (anyone with it can read the calendar), so it
 * is stored encrypted.
 */
function unfold(text) { return text.replace(/\r?\n[ \t]/g, '') }

function parseDate(v, params) {
  if (/^\d{8}$/.test(v)) return { at: new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)), allDay: true }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  // A TZID is read as local time: right for anyone whose calendar is in their own zone.
  return { at: z ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)) : new Date(+y, mo - 1, +d, +h, +mi, +s), allDay: false, tz: params }
}

function events(ics) {
  const out = []
  for (const block of unfold(ics).split('BEGIN:VEVENT').slice(1)) {
    const body = block.split('END:VEVENT')[0]
    const ev = {}
    for (const line of body.split(/\r?\n/)) {
      const i = line.indexOf(':'); if (i < 0) continue
      const [name, ...params] = line.slice(0, i).split(';')
      ev[name] = { value: line.slice(i + 1), params: params.join(';') }
    }
    if (!ev.DTSTART) continue
    const start = parseDate(ev.DTSTART.value, ev.DTSTART.params)
    const end = ev.DTEND ? parseDate(ev.DTEND.value, ev.DTEND.params) : null
    if (!start) continue
    const url = (ev.DESCRIPTION?.value.match(/https:\/\/[^\s\\]*(meet\.google|zoom\.us|teams\.microsoft)[^\s\\]*/) || [])[0]
    const text = (s) => s.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ')
    out.push({ title: text(ev.SUMMARY?.value || '(no title)'),
      start: start.at, end: end?.at || start.at, allDay: start.allDay, where: ev.LOCATION ? text(ev.LOCATION.value) : '', url })
  }
  return out
}

const hm = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
function until(ms) {
  const m = Math.round(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`
}

module.exports = {
  id: 'calendar',
  name: 'Calendar',
  icon: 'calendar',
  blurb: 'Your next meeting and the rest of today, from a private calendar address.',
  every: 60_000,
  fields: [{ key: 'ics', label: 'Secret iCal address', secret: true, placeholder: 'https://calendar.google.com/calendar/ical/.../basic.ics',
    help: 'Google Calendar: Settings, your calendar, Integrate calendar, "Secret address in iCal format". Outlook: Settings, Calendar, Shared calendars, Publish, ICS.' }],
  connected: (ctx) => !!ctx.secret('ics'),
  async poll(ctx) {
    const url = ctx.secret('ics')
    if (!url) throw new Error('Add your calendar address.')
    if (!ctx.memo.ics || Date.now() - ctx.memo.at > 10 * 60_000) {
      const r = await fetch(url.replace(/^webcal:/, 'https:'))
      if (!r.ok) throw new Error(`The calendar address answered ${r.status}`)
      ctx.memo.ics = events(await r.text()); ctx.memo.at = Date.now()
    }
    const now = new Date()
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59)
    const today = ctx.memo.ics.filter((e) => !e.allDay && e.end > now && e.start < endOfDay).sort((a, b) => a.start - b.start)
    const live = today.find((e) => e.start <= now)
    const next = today.find((e) => e.start > now)
    const soon = next && next.start - now < 15 * 60_000
    return {
      value: live ? 'now' : next ? until(next.start - now) : '·',
      caption: live ? live.title : next ? next.title : 'Nothing else today',
      urgency: live || soon ? 'warn' : 'calm',
      count: today.length,
      items: today.map((e) => ({ title: e.title, subtitle: e.where || '', meta: `${hm(e.start)} to ${hm(e.end)}`, url: e.url,
        urgency: e === live ? 'warn' : 'calm' })),
    }
  },
}
