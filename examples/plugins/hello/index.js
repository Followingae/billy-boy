// Copy this folder to %APPDATA%\billy-boy\plugins\hello and press "Reload plugins" in Billy's room.
module.exports = {
  id: 'hello',
  name: 'Hello',
  icon: 'star',
  blurb: 'An example plugin: says hello and counts its polls.',
  every: 60_000,
  fields: [{ key: 'who', label: 'Who to greet', placeholder: 'world' }],
  async poll(ctx) {
    ctx.memo.n = (ctx.memo.n || 0) + 1
    return {
      value: String(ctx.memo.n),
      caption: `hello, ${ctx.config.who || 'world'}`,
      urgency: 'calm',
      items: [{ title: 'Read the plugin guide', subtitle: 'docs/PLUGINS.md', url: 'https://github.com' }],
    }
  },
}
