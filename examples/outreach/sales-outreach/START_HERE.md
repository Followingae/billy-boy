# Sales outreach kit

Your pipeline's control room. An AI agent finds buyers who fit, researches each one, and writes
first touches and follow-ups as drafts. Billy shows you what only you can do: drafts to read and
send, replies, meetings, and the pipeline.

**The agent never sends email.** It writes drafts in your mailbox. You read each one and press
send. Keep that rule in the playbook.

## Set up (about 15 minutes, once)

1. **Fill `offer.md`.** Who you sell to, what you sell, proof, prices you are happy to quote. Set
   `CONFIRMED: yes` when it is right. Until then the agent only follows up on live threads.
2. **Give the agent its tools.** With Claude Code type `/mcp` and connect your mail (read and
   create drafts) and a contact source if you have one (Lusha, Apollo, ZoomInfo, Clay, your CRM).
   Without a contact source it still researches companies on the web and drafts to the generic
   or published addresses it finds.
3. **Do one run by hand** in this folder:
   `claude -p "Follow PLAYBOOK.md in this folder for one run."`
   Read `runs/` and check the drafts.
4. **Schedule it** when you trust a run: Claude Code's `/schedule`, or Windows Task Scheduler
   running the same command on weekday mornings. Never give it a send permission.
5. **Point Billy at `billy_state.json`** (done for you if you installed the kit from Billy's room).

## Files

- `PLAYBOOK.md`: what the agent does each run and the rules it never breaks.
- `offer.md`: your ideal customer, offer, proof points, prices.
- `billy_state.json`: what Billy shows; rewritten every run.
- `accounts.json`: created on the first run; every company, contact, stage, touches, next step.
- `runs/`: one short log per run.
