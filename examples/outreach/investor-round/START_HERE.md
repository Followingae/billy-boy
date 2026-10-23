# Investor round kit

This folder is your round's control room. An AI agent works it on a schedule; Billy shows you
what only you can do: drafts to read and send, replies, meetings, how much is in.

**The agent never sends email.** It writes drafts in your mailbox. You open each one, read it,
and press send. That rule is in the playbook and you should keep it there.

## Set up (about 15 minutes, once)

1. **Fill `facts.md`.** The only numbers your drafts may use. Change `CONFIRMED: no` to `yes`
   when it is right. Until then the agent only follows up with people already talking to you.
2. **Give the agent your tools.** With Claude Code: connect Gmail (read and create drafts) and,
   if you use one, your investor database (Metal, Crunchbase, Affinity, a spreadsheet). In Claude
   Code type `/mcp` to connect them.
3. **Do one run by hand.** In this folder run:
   `claude -p "Follow PLAYBOOK.md in this folder for one run."`
   Read what it did in `runs/`, and check the drafts in your mailbox.
4. **Schedule it** once you trust a run. Options, easiest first:
   - Claude Code's `/schedule` (runs in the cloud, your PC can be off).
   - Windows Task Scheduler running the same command 3 times a day.
   Give the schedule only the tools the playbook needs, and never a send permission.
5. **Point Billy at `billy_state.json`** (the kit did this for you if you installed it from Billy's room).

## Files

- `PLAYBOOK.md`: what the agent does each run, and the rules it may never break.
- `facts.md`: your numbers. One dated set.
- `billy_state.json`: what Billy shows. The agent rewrites it every run.
- `pipeline.json`: created on the first run; every investor, stage, touches, next step.
- `runs/`: one short log per run.
