# billy_state.json

The one file an outreach agent writes and Billy reads. Every field is optional except `items`.

```json
{
  "value": "4",
  "caption": "waiting on you",
  "urgency": "warn",
  "count": 4,
  "goal": { "label": "Round", "done": 250000, "target": 1500000, "unit": "USD" },
  "funnel": [
    { "label": "Found", "count": 80 },
    { "label": "Contacted", "count": 22 },
    { "label": "Talking", "count": 6 },
    { "label": "Meetings", "count": 3 },
    { "label": "Committed", "count": 1 }
  ],
  "items": [
    {
      "title": "Send: follow-up to Jane, Acme Ventures",
      "subtitle": "Draft ready. She asked for numbers last week.",
      "meta": "Acme",
      "url": "https://mail.google.com/mail/#drafts?compose=...",
      "hint": "open draft, read, send",
      "urgency": "alert"
    }
  ],
  "inbox": { "count": 12, "items": [{ "title": "Re: intro", "subtitle": "Jane Doe", "meta": "2026-10-23", "url": "https://..." }] },
  "updated_at": "2026-10-23T09:00:00+04:00"
}
```

- `send` on a draft item: `first`, `followup` or `reply`. Billy holds it back (calm, "ready, send
  Mon 09:00") outside the face's send window: working days and hours for first emails and
  follow-ups, a later cut-off for replies. Items without `send` (meetings, tasks) always show.
- `id` and `who` on an item let the user reject it with one click; rejections land in
  `dismissed.json` beside the state file, which the agent must respect.
- `urgency`: `calm`, `warn` or `alert`. Alert makes Billy's badge red and his pad gets a red rim.
- An item opens `url` (https only) or `path` (a local file) when clicked.
- Billy warns you on his own if `updated_at` is older than the face's "warn if not updated" setting, so a broken schedule never goes unnoticed.
- Put the most urgent items first. Keep it under 25.
