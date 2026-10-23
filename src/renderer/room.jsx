import { useEffect, useState, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { BotAvatar } from 'bot-avatars'
import { Icon, FACE_ICONS } from './icons'

/* Billy's room: where faces are added and connected, and where Billy gets dressed. */

const TYPES = ['droid', 'clover', 'blob', 'cat', 'ghost', 'drop', 'star', 'mech', 'alien', 'cloud', 'pebble', 'puddle']
const COLORS = ['#ff8a3d', '#ff5c8a', '#7c6cff', '#3aa0ff', '#20b2a0', '#9bd13c', '#ffc93c', '#f4efe6', '#2b2a28']
const HATS = ['none', 'beanie', 'beret', 'party', 'crown']

function Status({ face }) {
  if (!face) return null
  if (face.error) return <span className="chip bad"><i />{face.error}</span>
  if (!face.connected) return <span className="chip"><i />Not connected yet</span>
  if (face.result) return <span className="chip good"><i />Working · {face.result.value ? `${face.result.value} ` : ''}{face.result.caption}</span>
  return <span className="chip"><i />Checking…</span>
}

function Field({ f, value, onChange }) {
  const [show, setShow] = useState(false)
  const isSet = value === '__set__'
  return (
    <label className="field">
      <span className="lbl">{f.label}</span>
      <div className="inrow">
        <input
          type={f.secret && !show ? 'password' : f.type === 'number' ? 'number' : 'text'}
          value={isSet ? '' : value ?? ''}
          placeholder={isSet ? 'Saved and encrypted. Type to replace.' : f.placeholder || ''}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
        {f.type === 'file' && <button className="ghost" onClick={async (e) => { e.preventDefault(); const p = await window.billy.pickFile(); if (p) onChange(p) }}><Icon name="folder" size={15} />Browse</button>}
        {f.secret && !isSet && value && <button className="ghost" onClick={(e) => { e.preventDefault(); setShow((s) => !s) }}>{show ? 'Hide' : 'Show'}</button>}
      </div>
      {f.help && <span className="help">{f.help}</span>}
    </label>
  )
}

function FaceEditor({ face, conn, pinned, onDone }) {
  const [vals, setVals] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(face.name)
  useEffect(() => { window.billy.fieldsGet(face.uid).then(setVals); setName(face.name); setMsg(null) }, [face.uid])
  const save = async () => {
    setBusy(true)
    const r = await window.billy.fieldsSave(face.uid, vals)
    if (name !== face.name) await window.billy.faceUpdate(face.uid, { name })
    setMsg(r.ok ? { ok: true, text: 'Saved. Checking…' } : { ok: false, text: r.error })
    const t = await window.billy.faceTest(face.uid)
    setBusy(false)
    if (t?.error) setMsg({ ok: false, text: t.error })
    else if (r.ok) setMsg({ ok: true, text: 'Saved and working.' })
    window.billy.fieldsGet(face.uid).then(setVals)
  }
  const connect = async () => {
    setBusy(true); await window.billy.fieldsSave(face.uid, vals)
    setMsg({ ok: true, text: 'Finish signing in in your browser…' })
    const r = await window.billy.faceConnect(face.uid)
    setBusy(false); setMsg(r.ok ? { ok: true, text: r.message || 'Connected.' } : { ok: false, text: r.error })
  }
  const kit = async (template) => {
    const r = await window.billy.installKit(face.uid, template)
    if (r.ok) { setMsg({ ok: true, text: `Kit copied to ${r.dir}. Read START_HERE.md there.` }); window.billy.fieldsGet(face.uid).then(setVals) }
    else if (r.error) setMsg({ ok: false, text: r.error })
  }
  return (
    <div className="editor">
      <div className="ed-head">
        <span className="big-ic"><Icon name={face.icon} size={24} /></span>
        <div className="grow">
          <input className="title-in" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== face.name && window.billy.faceUpdate(face.uid, { name })} />
          <Status face={face} />
        </div>
        <label className="switch" title="Show this face's reading on Billy">
          <input type="checkbox" className="tog" checked={pinned === face.uid} onChange={(e) => window.billy.settingsSet({ pinned: e.target.checked ? face.uid : null })} />
          Show on Billy
        </label>
      </div>
      {conn?.blurb && <p className="blurb">{conn.blurb}</p>}

      <div className="icons">
        {FACE_ICONS.map((n) => (
          <button key={n} className={face.icon === n ? 'on' : ''} onClick={() => window.billy.faceUpdate(face.uid, { icon: n })} aria-label={n}><Icon name={n} size={16} /></button>
        ))}
      </div>

      {conn?.kit && !vals.source && (
        <div className="kits">
          <div><b>Start from a kit</b><span>A playbook your agent follows, a facts sheet, and the file Billy reads. Billy never sends: your agent writes drafts, you press send.</span></div>
          <button className="ghost" onClick={() => kit('investor-round')}><Icon name="rocket" size={15} />Investor round</button>
          <button className="ghost" onClick={() => kit('sales-outreach')}><Icon name="handshake" size={15} />Sales outreach</button>
        </div>
      )}

      {(conn?.fields || []).map((f) => (
        <Field key={f.key} f={f} value={vals[f.key]} onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))} />
      ))}
      {conn?.copy && (
        <div className="copy"><span>Redirect URI</span><code>{conn.copy}</code>
          <button className="ghost" onClick={() => navigator.clipboard.writeText(conn.copy)}><Icon name="copy" size={14} />Copy</button></div>
      )}

      <div className="ed-actions">
        {conn?.fields?.length > 0 && <button className="primary" disabled={busy} onClick={save}>{busy ? 'Working…' : 'Save'}</button>}
        {conn?.canConnect && <button className="primary alt" disabled={busy} onClick={connect}><Icon name="link" size={15} />Connect</button>}
        {msg && <span className={`msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</span>}
        <span className="grow" />
        <button className="danger" onClick={async () => { await window.billy.faceRemove(face.uid); onDone() }}><Icon name="trash" size={15} />Remove</button>
      </div>
    </div>
  )
}

function Room() {
  const [st, setSt] = useState(null)
  const [section, setSection] = useState(() => (location.hash || '#faces').slice(1))
  const [sel, setSel] = useState(null)
  const dragUid = useRef(null)
  useEffect(() => { window.billy.roomState().then(setSt); return window.billy.onRoomState(setSt) }, [])
  useEffect(() => window.billy.onRoomSection(setSection), [])
  useEffect(() => {
    if (section.startsWith('face:')) { setSel(section.slice(5)); setSection('faces') }
  }, [section])
  if (!st) return null
  const { catalog, faces, settings } = st
  const conn = (t) => catalog.find((c) => c.id === t)
  const selected = faces.find((f) => f.uid === sel) || faces[0]
  const look = settings.look || {}
  const setLook = (p) => window.billy.settingsSet({ look: p })

  const add = async (type, kind) => {
    const uid = await window.billy.faceAdd(type, kind)
    setSel(uid); setSection('faces')
  }
  const drop = (target) => {
    const from = dragUid.current; dragUid.current = null
    if (!from || from === target) return
    const order = faces.map((f) => f.uid).filter((u) => u !== from)
    order.splice(order.indexOf(target), 0, from)
    window.billy.faceOrder(order)
  }

  const NAV = [['faces', 'Faces', 'sparkles'], ['add', 'Add a face', 'plus'], ['look', 'Look', 'heart'], ['behave', 'Behaviour', 'settings'], ['plugins', 'Plugins', 'puzzle']]

  return (
    <div className="room">
      <div className="titlebar">
        <span className="brand"><BotAvatar type={look.type || 'droid'} color={look.color} size={22} interactive={false} paused />Billy's room</span>
        <span className="grow" />
        <button onClick={() => window.billy.roomMin()} aria-label="Minimise">–</button>
        <button onClick={() => window.billy.roomClose()} aria-label="Close"><Icon name="x" size={15} /></button>
      </div>

      {section === 'welcome' ? (
        <div className="welcome">
          <BotAvatar type={look.type || 'droid'} color={look.color} size={150} face="mouth" state="working" hat={look.hat !== 'none' ? look.hat : undefined} />
          <h1>Hi, I'm Billy.</h1>
          <p>I sit on the edge of your screen and tell you what needs you. Drag me to any edge or corner and I stick. Hover me and my faces pop out; click one for the detail. Right-click me for everything else.</p>
          <div className="row-btns">
            <button className="primary" onClick={() => setSection('add')}>Give me some faces</button>
            <button className="ghost" onClick={() => setSection('look')}>Dress me up first</button>
          </div>
          <button className="link" onClick={() => { window.billy.settingsSet({ onboarded: true }); window.billy.roomClose() }}>Skip for now</button>
        </div>
      ) : (
        <div className="body">
          <nav>
            {NAV.map(([id, label, ic]) => (
              <button key={id} className={section === id ? 'on' : ''} onClick={() => setSection(id)}><Icon name={ic} size={16} />{label}</button>
            ))}
            <span className="grow" />
            <p className="fine">Your tokens and passwords are encrypted with your Windows sign-in and never leave this PC.</p>
          </nav>

          <main>
            {section === 'faces' && (
              <div className="faces">
                <div className="facelist">
                  <h2>Faces</h2>
                  <p className="sub">Drag to reorder. The order is how they fan out of Billy.</p>
                  {faces.map((f) => (
                    <button key={f.uid} draggable onDragStart={() => { dragUid.current = f.uid }} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(f.uid)}
                      className={`fi ${selected?.uid === f.uid ? 'on' : ''}`} onClick={() => setSel(f.uid)}>
                      <Icon name="grip" size={14} className="grip" />
                      <span className="fic"><Icon name={f.icon} size={16} /></span>
                      <span className="grow name">{f.name}</span>
                      <i className={`st ${f.error ? 'bad' : f.result || f.builtin ? 'good' : ''}`} />
                    </button>
                  ))}
                  <button className="fi add" onClick={() => setSection('add')}><Icon name="plus" size={16} />Add a face</button>
                </div>
                {selected ? <FaceEditor face={selected} conn={conn(selected.type)} pinned={settings.pinned} onDone={() => setSel(null)} />
                  : <div className="editor empty"><p>Add a face to get started.</p></div>}
              </div>
            )}

            {section === 'add' && (
              <div className="add">
                <h2>Add a face</h2>
                <p className="sub">Each face is one thing Billy keeps an eye on.</p>
                <div className="grid">
                  {catalog.filter((c) => !c.kinds).map((c) => {
                    const have = faces.some((f) => f.type === c.id)
                    return (
                      <div key={c.id} className="tile">
                        <span className="tic"><Icon name={c.icon} size={20} /></span>
                        <b>{c.name}{c.plugin && <em>plugin</em>}</b>
                        <span>{c.blurb}</span>
                        <button className={have && !c.multi ? 'ghost' : 'primary'} onClick={() => add(c.id)}>{have && !c.multi ? 'Open' : 'Add'}</button>
                      </div>
                    )
                  })}
                  {catalog.filter((c) => c.kinds).flatMap((c) => c.kinds.map((k) => (
                    <div key={`${c.id}-${k.id}`} className={`tile ${c.id === 'outreach' ? 'feature' : ''}`}>
                      <span className="tic"><Icon name={k.icon} size={20} /></span>
                      <b>{k.title || k.name}{c.plugin && <em>plugin</em>}</b>
                      <span>{k.blurb || c.blurb}</span>
                      <button className="primary" onClick={() => add(c.id, k.id)}>Add</button>
                    </div>
                  )))}
                </div>
              </div>
            )}

            {section === 'look' && (
              <div className="look">
                <div className="stagebox">
                  <BotAvatar type={look.type || 'droid'} color={look.color} size={180} face="mouth" shading={look.shading || 'fabric'}
                    hat={look.hat && look.hat !== 'none' ? look.hat : undefined} />
                </div>
                <div className="pick">
                  <h3>Body</h3>
                  <div className="types">
                    {TYPES.map((t) => (
                      <button key={t} className={look.type === t ? 'on' : ''} onClick={() => setLook({ type: t })} aria-label={t}>
                        <BotAvatar type={t} color={look.color} size={44} interactive={false} paused />
                      </button>
                    ))}
                  </div>
                  <h3>Colour</h3>
                  <div className="swatches">
                    {COLORS.map((c) => <button key={c} className={look.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setLook({ color: c })} aria-label={c} />)}
                  </div>
                  <h3>Hat</h3>
                  <div className="seg">{HATS.map((h) => <button key={h} className={(look.hat || 'none') === h ? 'on' : ''} onClick={() => setLook({ hat: h })}>{h}</button>)}</div>
                  <h3>Finish</h3>
                  <div className="seg">{['fabric', 'plastic'].map((s) => <button key={s} className={(look.shading || 'fabric') === s ? 'on' : ''} onClick={() => setLook({ shading: s })}>{s === 'fabric' ? 'Plush' : 'Glossy'}</button>)}</div>
                  <p className="sub">He puts headphones on while Spotify plays and glasses on while you focus.</p>
                </div>
              </div>
            )}

            {section === 'behave' && (
              <div className="behave">
                <h2>Behaviour</h2>
                <label className="line"><span><b>Snap sound</b><small>A soft tock when Billy lands on an edge.</small></span>
                  <input type="checkbox" className="tog" checked={settings.sound} onChange={(e) => window.billy.settingsSet({ sound: e.target.checked })} /></label>
                <label className="line"><span><b>Start with Windows</b><small>Billy is there when you sign in.</small></span>
                  <input type="checkbox" className="tog" checked={settings.startWithWindows} onChange={(e) => window.billy.settingsSet({ startWithWindows: e.target.checked })} /></label>
                <div className="line"><span><b>Quiet hours</b><small>Billy naps, unless something is urgent.</small></span>
                  <span className="hours">
                    <select value={settings.quiet?.from ?? 23} onChange={(e) => window.billy.settingsSet({ quiet: { ...settings.quiet, from: +e.target.value } })}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
                    to
                    <select value={settings.quiet?.to ?? 7} onChange={(e) => window.billy.settingsSet({ quiet: { ...settings.quiet, to: +e.target.value } })}>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
                  </span></div>
                <div className="line"><span><b>Bring Billy to you</b><small>From anywhere, any screen.</small></span><kbd>Ctrl + Alt + B</kbd></div>
                <div className="tips">
                  <h3>How to use him</h3>
                  <ul>
                    <li><b>Drag</b> him to any edge or corner and let go. He sticks.</li>
                    <li><b>Hover</b> him and his faces pop out. Hover a face to read it, click it for the detail.</li>
                    <li><b>Scroll</b> on him to change the volume.</li>
                    <li><b>Right-click</b> him or a face for everything else: tuck away, refresh, settings.</li>
                  </ul>
                </div>
              </div>
            )}

            {section === 'plugins' && (
              <div className="plugins">
                <h2>Plugins</h2>
                <p className="sub">A plugin is a folder with an <code>index.js</code> that exports a face. Plugins live in your app-data folder, not in Billy's code, so private ones stay private.</p>
                <div className="copy"><span>Folder</span><code>{st.pluginDir}</code></div>
                <div className="row-btns">
                  <button className="primary" onClick={() => window.billy.openPlugins()}><Icon name="folder" size={15} />Open the folder</button>
                  <button className="ghost" onClick={() => window.billy.reloadPlugins()}><Icon name="refresh" size={15} />Reload plugins</button>
                </div>
                <p className="sub">Only install plugins you trust: they run with the same access as Billy. See docs/PLUGINS.md for a 20-line example.</p>
                <h3>Installed</h3>
                {catalog.filter((c) => c.plugin).length === 0 ? <p className="sub">None yet.</p> : catalog.filter((c) => c.plugin).map((c) => (
                  <div key={c.id} className="fi static"><span className="fic"><Icon name={c.icon} size={16} /></span><b>{c.name}</b><span className="sub">{c.blurb}</span></div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<Room />)
