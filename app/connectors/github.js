/** GitHub: unread notifications and pull requests waiting for your review. */
async function gh(ctx, p) {
  const r = await fetch(`https://api.github.com${p}`, { headers: {
    Authorization: `Bearer ${ctx.secret('token')}`, Accept: 'application/vnd.github+json', 'User-Agent': 'billy-boy' } })
  if (r.status === 401) throw new Error('GitHub refused the token. Make a new one.')
  if (!r.ok) throw new Error(`GitHub said ${r.status}`)
  return r.json()
}
module.exports = {
  id: 'github',
  name: 'GitHub',
  icon: 'github',
  blurb: 'Unread notifications and pull requests waiting for your review.',
  every: 120_000,
  fields: [{ key: 'token', label: 'Token', secret: true, placeholder: 'github_pat_...',
    help: 'github.com/settings/tokens: a fine-grained token with read access to Notifications and Pull requests is enough.' }],
  connected: (ctx) => !!ctx.secret('token'),
  async poll(ctx) {
    if (!ctx.secret('token')) throw new Error('Add a token.')
    const [notes, prs] = await Promise.all([
      gh(ctx, '/notifications?per_page=30'),
      gh(ctx, '/search/issues?q=' + encodeURIComponent('is:open is:pr review-requested:@me archived:false') + '&per_page=10'),
    ])
    const reviews = prs.items || []
    const items = [
      ...reviews.map((p) => ({ title: p.title, subtitle: p.repository_url.split('/').slice(-2).join('/'), meta: 'Review',
        url: p.html_url, urgency: 'warn' })),
      ...notes.slice(0, 15).map((n) => ({ title: n.subject.title, subtitle: n.repository.full_name, meta: n.reason.replace(/_/g, ' '),
        url: `https://github.com/notifications?query=repo:${n.repository.full_name}` })),
    ]
    const count = notes.length + reviews.length
    return { value: String(count), count, caption: reviews.length ? `${reviews.length} to review` : 'notifications',
      urgency: reviews.length ? 'warn' : 'calm', items }
  },
}
