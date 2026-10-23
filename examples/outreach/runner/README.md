# The always-on runner

Your outreach agent works best when it reacts within minutes, not when you remember to run it.
This keeps it on, for an investor round or a sales push, without getting in your way.

| | |
| --- | --- |
| Every 10 minutes | A quick, cheap check: new replies, sent drafts, meetings coming up or just finished, follow-ups due. If nothing changed it stops in seconds. |
| When something changed | A full run straight away: replies, follow-ups and meeting prep drafted, your CRM updated, Billy turns red. |
| Once a night | A deep run: new prospects, research, tidy-up, tomorrow's first emails lined up. |
| PC was off | Starts at sign-in and catches up on everything it missed. |
| You're gaming | Pauses while a full-screen game or app runs and catches up when you stop. Lowest priority, no windows, ever. |
| Sending | Never. Send, reply, forward, delete and label tools are blocked; it only writes drafts. |

## Turn it on

You need [Claude Code](https://claude.com/claude-code) signed in, with your mail connected (in Claude
Code type `/mcp`). Then, in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Folder "C:\path\to\your outreach folder"
```

Billy's room shows this exact command for your folder (the face's "How it runs" screen) with a copy
button. Billy's card then shows when the runner last checked, and warns you if it stops.

To stop it: add `-Remove` to the same command.

## Cost

The quick check uses a small, fast model with a hard budget cap per run; full runs use a stronger
model only when there is real work. Caps are set in `runner.ps1` (`--max-budget-usd`).
