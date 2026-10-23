# Billy Boy

A little desktop companion for Windows. Billy sticks to any edge or corner of any screen, and
tells you what needs you.

- **Drag** him anywhere. Near an edge he's pulled in, then lands with a clack and melts into it.
  Corners work too, on every monitor.
- **Hover** him and his faces pop out as droplets. **Hover a face** and it stretches into a
  readout. **Click** it for the detail card.
- **Scroll** on him to change the volume. He follows your keyboard's volume knob live.
- **Right-click** for everything else: tuck him away, refresh, settings.
- `Ctrl + Alt + B` brings him to your pointer from anywhere.

He wears headphones while Spotify plays, puts glasses on while you focus, naps in quiet hours,
and hops when something urgent comes in.

## Faces

| Face | What it shows | Setup |
| --- | --- | --- |
| Outreach: investor round | Drafts to send, replies, meetings, how much of the round is in | A kit with the playbook your AI agent follows |
| Outreach: sales | Drafts to send, replies, meetings, the pipeline | A kit with the playbook your AI agent follows |
| Spotify | What's playing; play, pause, skip | Your own free Spotify developer app (2 minutes) |
| Calendar | Your next meeting, the rest of today | Your calendar's secret iCal address |
| Mail | Unread count and the newest unread mail (read-only) | An IMAP app password |
| GitHub | Notifications and PRs waiting for your review | A read-only token |
| Weather | Temperature now and later | Just a place name |
| Focus | A focus timer | Nothing |
| Volume | System volume | Nothing |
| Custom feed | Anything that writes a small JSON file | A file path or https address |

Everything is set up in **Billy's room** (right-click Billy, "Billy's room").

### Outreach, the honest version

Billy doesn't write or send email. An AI agent you schedule (Claude Code works well) follows a
playbook from `examples/outreach/`: it finds investors or buyers, researches them, writes
**drafts** in your mailbox, and updates one JSON file. Billy reads that file and tells you what
to read and send. The playbooks forbid sending, and they forbid inventing numbers.
See `examples/outreach/FORMAT.md` for the file format.

## Get Billy

**Just want to use him?** Download `BillyBoy-portable.exe` from the
[latest release](https://github.com/Followingae/billy-boy/releases/latest) and double-click it.
No install, no account. Windows 10 or 11.

Windows may say "Windows protected your PC" because the app isn't code-signed yet: click
**More info**, then **Run anyway**. Billy's room opens on first run so you can give him faces.

**Want to change him?** Fork this repo (the Fork button, top right), then:

```bash
git clone https://github.com/<your-username>/billy-boy.git
cd billy-boy
npm install
npm run start
```

You need [Node.js](https://nodejs.org) 20 or newer. `npm run dist` builds your own portable
`.exe` in `release/`. Your fork is yours: changes there never touch this repo. If you build
something others would like, open a pull request.

## Your accounts stay yours

- Settings live in `%APPDATA%\billy-boy\settings.json`. That's on your machine, not in the repo.
- Tokens and passwords live in `%APPDATA%\billy-boy\secrets.bin`, encrypted with your Windows
  sign-in (DPAPI, through Electron's `safeStorage`). Billy refuses to store a secret if the
  machine can't encrypt it.
- Nothing is sent anywhere except to the service a face talks to (Spotify, your mail server, and
  so on). There's no telemetry and no Billy server.
- Forking or cloning the repo copies code only. No one's settings or secrets come with it.

## Plugins

A plugin is a folder with an `index.js` in `%APPDATA%\billy-boy\plugins\`. Use it for private
faces, like your company's internal dashboard. See [docs/PLUGINS.md](docs/PLUGINS.md) and
`examples/plugins/hello`. Only install plugins you trust; they run with Billy's access.

## Credits

Billy's body is [bot-avatars](https://github.com/Jakubantalik/Libraries.dev) and his liquid is
[liquid-gooey](https://github.com/Jakubantalik/Libraries.dev), both by Jakub Antalik (MIT).
Icons by [Lucide](https://lucide.dev) (ISC).

MIT licensed. See [LICENSE](LICENSE).
