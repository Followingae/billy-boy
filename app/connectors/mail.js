/**
 * Mail over IMAP: unread count and the newest unread messages. Read-only by design: the
 * mailbox is opened read-only, so Billy can never mark, move or send anything.
 * Gmail personal accounts: turn on 2-step verification and make an app password.
 * Google Workspace accounts often block app passwords; their admin has to allow IMAP.
 */
const { ImapFlow } = require('imapflow')

module.exports = {
  id: 'mail',
  name: 'Mail',
  icon: 'mail',
  blurb: 'Unread mail at a glance. Opens Gmail or your mail app on click. Read-only.',
  every: 90_000,
  fields: [
    { key: 'email', label: 'Email address', placeholder: 'you@gmail.com' },
    { key: 'password', label: 'App password', secret: true, placeholder: '16 letters',
      help: 'Gmail: myaccount.google.com/apppasswords (needs 2-step verification). Other providers: their IMAP password.' },
    { key: 'host', label: 'IMAP server', placeholder: 'imap.gmail.com' },
    { key: 'openUrl', label: 'Open mail at', placeholder: 'https://mail.google.com' },
  ],
  connected: (ctx) => !!ctx.secret('password'),
  async poll(ctx) {
    const { email, host } = ctx.config
    if (!email || !ctx.secret('password')) throw new Error('Add your address and app password.')
    const client = new ImapFlow({ host: host || 'imap.gmail.com', port: 993, secure: true, logger: false,
      auth: { user: email, pass: ctx.secret('password') } })
    try {
      await client.connect()
    } catch (e) {
      const why = e.authenticationFailed || /auth/i.test(e.responseText || e.message)
        ? 'The mail server refused the sign-in. Check the app password (Workspace accounts may block them).'
        : `Could not reach ${host || 'imap.gmail.com'}: ${e.responseText || e.message}`
      throw new Error(why)
    }
    try {
      const lock = await client.getMailboxLock('INBOX', { readOnly: true })
      try {
        const uids = (await client.search({ seen: false }, { uid: true })) || []
        const newest = uids.slice(-12).reverse()
        const items = []
        if (newest.length) for await (const m of client.fetch(newest.join(','), { envelope: true }, { uid: true })) {
          const from = m.envelope.from?.[0]
          items.push({ title: m.envelope.subject || '(no subject)', subtitle: from?.name || from?.address || '',
            meta: m.envelope.date ? new Date(m.envelope.date).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '',
            url: ctx.config.openUrl || 'https://mail.google.com', at: m.envelope.date })
        }
        items.sort((a, b) => new Date(b.at) - new Date(a.at))
        return { value: String(uids.length), count: uids.length, caption: 'unread', urgency: uids.length > 20 ? 'warn' : 'calm', items }
      } finally { lock.release() }
    } finally { await client.logout().catch(() => {}) }
  },
}
