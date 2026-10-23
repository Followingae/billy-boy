# Writing a face

A face is a small Node module. Put it in `%APPDATA%\billy-boy\plugins\<name>\index.js`, then
open Billy's room, go to Plugins, and press "Reload plugins". It shows up under "Add a face".

```js
module.exports = {
  id: 'hello',                 // unique
  name: 'Hello',
  icon: 'star',                // one of the icon names in src/renderer/icons.jsx
  blurb: 'Says hello, and counts.',
  every: 60_000,               // how often poll() runs, in ms
  fields: [                    // shown in Billy's room; secret ones are stored encrypted
    { key: 'who', label: 'Who to greet', placeholder: 'world' },
    { key: 'token', label: 'API token', secret: true },
  ],
  async poll(ctx) {
    ctx.memo.n = (ctx.memo.n || 0) + 1         // memo survives between polls
    return {
      value: String(ctx.memo.n),                // short: shown on the droplet and Billy's badge
      caption: `hello, ${ctx.config.who || 'world'}`,
      urgency: 'calm',                          // calm | warn | alert
      items: [{ title: 'Open Billy on GitHub', url: 'https://github.com' }],
    }
  },
}
```

## What `poll` gets

| | |
| --- | --- |
| `ctx.config` | the plain field values |
| `ctx.secret(key)` / `ctx.setSecret(key, value)` | this face's encrypted values |
| `ctx.shared(key)` / `ctx.setShared(key, value)` | encrypted values shared by every face of this plugin (one sign-in, several faces) |
| `ctx.memo` | an object kept between polls |
| `ctx.openExternal(url)` | open an https link |
| `ctx.notify(title, body)` | a Windows notification, and Billy hops |

Throw an `Error` with a plain-language message when something is wrong: Billy shows it on the
face and offers a "Fix it" button.

## Optional

- `kinds: [{ id, name, icon, title, blurb }]`: several faces from one plugin; the chosen kind
  arrives as `ctx.config.kind`.
- `multi: true`: allow more than one face of this plugin.
- `connect(ctx)`: adds a Connect button (OAuth and similar). Return a short success message.
- `connected(ctx)`: return whether the face is signed in.
- `action(ctx, id)` plus `actions: [{ id, label, icon }]` in the poll result: buttons on the card.

## The result

`value`, `caption`, `urgency`, `count`, `items[{ title, subtitle, meta, url | path, hint,
urgency, art }]`, and optionally `goal`, `funnel`, `progress`, `actions`, `art`. See
`examples/outreach/FORMAT.md`.
