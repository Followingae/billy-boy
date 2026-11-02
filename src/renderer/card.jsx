import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Icon } from './icons'
import { toneOf } from './tone'

const URGENT = { calm: 'var(--ink)', warn: 'var(--warn)', alert: 'var(--alert)' }

function Goal({ goal }) {
  if (!goal || !goal.target) return null
  const pct = Math.max(0, Math.min(1, goal.done / goal.target))
  const fmt = (n) => (goal.unit ? `${goal.unit} ${Number(n).toLocaleString()}` : Number(n).toLocaleString())
  return (
    <div className="goal">
      <div className="goal-top"><span>{goal.label || 'Goal'}</span><b>{goal.target === 1 ? `${Math.round(pct * 100)}%` : `${fmt(goal.done)} of ${fmt(goal.target)}`}</b></div>
      <div className="bar"><i style={{ width: `${Math.max(2, pct * 100)}%` }} /></div>
    </div>
  )
}

function Funnel({ funnel }) {
  if (!funnel?.length) return null
  const max = Math.max(...funnel.map((s) => s.count || 0), 1)
  return (
    <div className="funnel">
      {funnel.map((s) => (
        <div key={s.label} className="stage-col" title={`${s.count} ${s.label}`}>
          <div className="col"><i style={{ height: `${Math.max(6, (s.count / max) * 100)}%` }} /></div>
          <b>{s.count}</b><small>{s.label}</small>
        </div>
      ))}
    </div>
  )
}

function Row({ it, uid, onDismiss }) {
  // `copy`: a message for a channel Billy can't draft into (LinkedIn, WhatsApp): one click copies it
  // and opens the chat, so sending is a paste.
  const go = it.copy ? () => { window.billy.copyText(it.copy); if (it.url) window.billy.openUrl(it.url) } : it.setup ? () => { window.billy.openRoom(`setup:${uid}:${it.setup}`); window.billy.closeCard() }
    : it.url ? () => window.billy.openUrl(it.url) : it.path ? () => window.billy.openPath(it.path) : null
  return (
    <button className={`row ${go ? 'link' : ''}`} onClick={go || undefined} disabled={!go}>
      {it.art ? <img className="art" src={it.art} alt="" /> : <i className={`u ${it.urgency || 'calm'}`} />}
      <span className="txt">
        <b>{it.title}</b>
        {(it.subtitle || it.hint) && <small>{it.subtitle}{it.hint ? <em>{it.subtitle ? ' · ' : ''}{it.hint}</em> : null}</small>}
      </span>
      {it.meta && <span className="meta">{it.meta}</span>}
      {go && <Icon name={it.copy ? 'copy' : it.setup ? 'chevron' : 'out'} size={14} className="go" />}
      {it.dismissable && onDismiss && (
        <span role="button" tabIndex={0} className="nope" title="Don't suggest this again"
          onClick={(e) => { e.stopPropagation(); onDismiss(it) }}><Icon name="x" size={13} /></span>
      )}
    </button>
  )
}

function Card() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(null)
  // Expanded: a wide card, every line in full, as tall as the screen allows. Opening another
  // face's card starts small again.
  const [big, setBig] = useState(false)
  const ref = useRef(null)
  const leave = useRef(null)
  useEffect(() => window.billy.onCard((d) => {
    setData((prev) => { if (prev?.face?.uid !== d?.face?.uid) { setBig(false); window.billy.cardBig(false) } return d })
  }), [])
  useEffect(() => {
    if (!ref.current) return
    // scrollHeight, not the box: an expanded card is capped by its own window, and measuring
    // the capped box would never let the window grow.
    const report = () => window.billy.cardSize(Math.ceil(ref.current.scrollHeight) + 28)
    const ro = new ResizeObserver(report)
    ro.observe(ref.current)
    for (const el of ref.current.querySelectorAll('.list')) ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [data?.face?.uid, big])
  useEffect(() => window.billy.onDemoBig(() => { setBig(true); window.billy.cardBig(true) }), [])
  const toggleBig = () => { const b = !big; setBig(b); window.billy.cardBig(b) }
  if (!data) return null
  const { face } = data
  const r = face.result || {}
  const u = face.error && !face.result ? 'warn' : r.urgency || 'calm'
  const items = r.items || []

  const act = async (id) => { setBusy(id); await window.billy.act(face.uid, id); setBusy(null) }

  return (
    <div className={`wrap ${big ? 'big' : ''}`} onMouseLeave={() => { if (!big) leave.current = setTimeout(() => window.billy.closeCard(), 1600) }}
      onMouseEnter={() => clearTimeout(leave.current)}>
      <div ref={ref} className="card" style={{ '--u': URGENT[u], '--billy': toneOf(data.color) }}>
        <header>
          <span className="ic">{r.art ? <img src={r.art} alt="" /> : <Icon name={face.icon} size={18} />}</span>
          <div className="h">
            <span className="name">{face.name}</span>
            <span className="cap">{face.error && !face.result ? 'Needs setup' : r.caption}{r.updated ? ` · ${r.updated}` : ''}</span>
          </div>
          {r.value ? <span className="value">{r.value}</span> : null}
          <button className="x" onClick={toggleBig} aria-label={big ? 'Shrink' : 'Expand'} title={big ? 'Shrink' : 'Expand'}>
            <Icon name={big ? 'shrink' : 'grow'} size={14} />
          </button>
          <button className="x" onClick={() => window.billy.closeCard()} aria-label="Close"><Icon name="x" size={15} /></button>
        </header>

        {face.error && (
          <div className="err">
            <span>{face.error}</span>
            <button onClick={() => { window.billy.openRoom(`face:${face.uid}`); window.billy.closeCard() }}>Fix it</button>
          </div>
        )}

        <Goal goal={r.goal} />
        <Funnel funnel={r.funnel} />

        {r.actions?.length > 0 && (
          <div className="actions">
            {r.actions.map((a) => (
              <button key={a.id} onClick={() => act(a.id)} className={busy === a.id ? 'busy' : ''} aria-label={a.label}>
                <Icon name={a.icon} size={16} />{r.actions.length < 3 && <span>{a.label}</span>}
              </button>
            ))}
          </div>
        )}
        {r.progress != null && !r.goal && face.type !== 'outreach' && <div className="bar thin"><i style={{ width: `${r.progress * 100}%` }} /></div>}

        {items.length > 0 && (
          <div className="list">
            {r.funnel || r.goal ? <h4>Waiting on you</h4> : null}
            {items.slice(0, big ? 200 : 25).map((it) => <Row key={it.key || it.title} it={it} uid={face.uid} onDismiss={(x) => act(`dismiss:${x.key}`)} />)}
          </div>
        )}
        {r.inbox?.items?.length > 0 && (
          <div className="list">
            <h4>Inbox · {r.inbox.count} unread</h4>
            {r.inbox.items.slice(0, big ? 50 : 6).map((it, i) => <Row key={i} it={it} uid={face.uid} />)}
          </div>
        )}
        {face.type === 'outreach' && <p className="rule">Billy never sends. Open a draft, read it, send it yourself.</p>}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Card />)
