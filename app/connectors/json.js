/** Any face you like: point Billy at a JSON file or an https address in the face format
 *  (value, caption, urgency, items). Handy for scripts, cron jobs and dashboards. */
const fs = require('fs')
module.exports = {
  id: 'json',
  name: 'Custom feed',
  icon: 'braces',
  blurb: 'Anything that can write a small JSON file: a script, a cron job, a dashboard.',
  every: 30_000,
  multi: true,
  fields: [{ key: 'source', label: 'File or https address', placeholder: 'C:\\...\\face.json  or  https://...', type: 'file' }],
  async poll(ctx) {
    const src = ctx.config.source
    if (!src) throw new Error('Choose a file or address.')
    const j = /^https:\/\//.test(src) ? await (await fetch(src)).json() : JSON.parse(fs.readFileSync(src, 'utf8'))
    return { value: String(j.value ?? j.count ?? ''), caption: j.caption || '', urgency: j.urgency || 'calm', count: j.count, items: j.items || [] }
  },
}
