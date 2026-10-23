/** A focus timer. Billy puts his glasses on while it runs and taps you when it is done. */
module.exports = {
  id: 'focus',
  name: 'Focus',
  icon: 'focus',
  blurb: 'A focus timer. Billy wears his glasses while you work and nudges you when time is up.',
  every: 1000,
  fields: [{ key: 'minutes', label: 'Minutes', placeholder: '25', type: 'number' }],
  async poll(ctx) {
    const until = ctx.memo.until || 0
    const left = Math.max(0, until - Date.now())
    if (until && !left) { ctx.memo.until = 0; ctx.notify('Focus done', 'Time for a break.') }
    const mins = Number(ctx.config.minutes) || 25
    if (!left) return { value: `${mins}m`, caption: 'Ready when you are', urgency: 'calm', focusing: false,
      actions: [{ id: 'start', label: `Start ${mins} min`, icon: 'play' }] }
    const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60
    return { value: `${m}:${String(s).padStart(2, '0')}`, caption: 'Focusing', urgency: 'calm', focusing: true,
      progress: 1 - left / (ctx.memo.length || 1), actions: [{ id: 'stop', label: 'Stop', icon: 'stop' }] }
  },
  async action(ctx, id) {
    const mins = Number(ctx.config.minutes) || 25
    if (id === 'start') { ctx.memo.length = mins * 60000; ctx.memo.until = Date.now() + ctx.memo.length }
    if (id === 'stop') ctx.memo.until = 0
  },
}
