/**
 * Guided setup for an outreach face. The user answers a few screens in Billy's room; Billy
 * writes the folder the outreach agent works from: the playbook, a facts sheet built from the
 * answers, and the state file Billy reads. Nobody has to open or edit a file by hand.
 *
 * Billy only overwrites the facts sheet of a folder HE set up (`managed`). The first time he
 * takes over an existing folder, the old sheet is kept beside it as *.before-billy.md.
 */
const fs = require('fs')
const path = require('path')

const YOU = {
  id: 'you', title: 'About you', intro: 'How your emails are signed.',
  fields: [
    { key: 'name', label: 'Your name', placeholder: 'Sam Rivera', required: true },
    { key: 'title', label: 'Your title', placeholder: 'Founder & CEO' },
    { key: 'company', label: 'Company', placeholder: 'Acme', required: true },
    { key: 'phone', label: 'Phone (optional)', placeholder: '+1 555 0100' },
    { key: 'website', label: 'Website', placeholder: 'acme.com' },
  ],
}

const STEPS = {
  round: [
    YOU,
    { id: 'round', title: 'The round', intro: 'The terms your agent may quote.', fields: [
      { key: 'raising', label: 'Raising', placeholder: '1,500,000', type: 'number', required: true, half: true },
      { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'], half: true },
      { key: 'instrument', label: 'Instrument', type: 'select', options: ['Priced equity', 'SAFE', 'Convertible note'], half: true },
      { key: 'valuation', label: 'Valuation or cap', placeholder: '7M pre-money', half: true },
      { key: 'minTicket', label: 'Smallest cheque', placeholder: '25,000', half: true },
      { key: 'committed', label: 'Committed so far', placeholder: '0', type: 'number', half: true },
      { key: 'lead', label: 'Lead investor', placeholder: 'None yet' },
      { key: 'close', label: 'Target close', type: 'date' },
      { key: 'deck', label: 'Deck link to paste in emails', placeholder: 'https://docsend.com/...', help: 'A view-only link. Agents cannot attach files.' },
    ] },
    { id: 'traction', title: 'Traction', intro: 'One dated set of numbers. Your agent never invents any.', fields: [
      { key: 'revenue', label: 'Revenue', placeholder: 'USD 40K MRR, Oct 2026', required: true },
      { key: 'growth', label: 'Growth', placeholder: '18% month on month since June' },
      { key: 'customers', label: 'Customers or users', placeholder: '120 paying teams' },
      { key: 'burn', label: 'Burn and runway', placeholder: 'USD 60K a month, 14 months' },
      { key: 'team', label: 'Team', placeholder: '9 people' },
      { key: 'proof', label: 'Proof points, one per line', type: 'textarea', placeholder: 'Closed Acme, a 5-year contract\nFeatured in TechCrunch' },
    ] },
    { id: 'answers', title: 'The questions investors ask', intro: 'One sentence each.', fields: [
      { key: 'whyNow', label: 'Why now?', type: 'textarea' },
      { key: 'whyYou', label: 'Why you?', type: 'textarea' },
      { key: 'useOfFunds', label: 'What the money is for', type: 'textarea' },
    ] },
  ],
  sales: [
    YOU,
    { id: 'who', title: 'Who you sell to', intro: 'Your agent only goes after companies that fit this.', fields: [
      { key: 'industries', label: 'Industries', placeholder: 'Restaurants, retail, hotels', required: true },
      { key: 'places', label: 'Where', placeholder: 'London, Manchester' },
      { key: 'size', label: 'Company size', placeholder: 'Brands with a marketing team' },
      { key: 'titles', label: 'Who to write to', placeholder: 'Head of Marketing, Brand Manager' },
      { key: 'triggers', label: 'Signs a company needs you right now', type: 'textarea', placeholder: 'Opening a new branch\nLaunching a product\nHiring a social media manager' },
      { key: 'never', label: 'Never contact', type: 'textarea', placeholder: 'Current clients, competitors' },
    ] },
    { id: 'offer', title: 'What you sell', intro: 'Only what you are happy to say in a first email.', fields: [
      { key: 'oneLiner', label: 'In one sentence', type: 'textarea', required: true },
      { key: 'prices', label: 'Prices you are happy to quote (optional)', type: 'textarea', placeholder: 'Campaigns from 15,000' },
      { key: 'firstProject', label: 'What a first project looks like', placeholder: 'One 4-week campaign' },
      { key: 'proof', label: 'Results you can name, one per line', type: 'textarea', placeholder: 'Acme: 1.2M reach' },
    ] },
    { id: 'target', title: 'Targets', intro: 'What good looks like each month.', fields: [
      { key: 'meetings', label: 'Meetings to book a month', type: 'number', placeholder: '12', half: true },
      { key: 'hours', label: 'Hours for meetings', placeholder: 'Sun to Thu, 10:00 to 18:00', half: true },
      { key: 'booking', label: 'Booking link (optional)', placeholder: 'https://cal.com/...' },
    ] },
  ],
}

const line = (label, v) => `- ${label}: ${v && String(v).trim() ? String(v).trim() : '(not given)'}`
const list = (v) => (v || '').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => `- ${s}`).join('\n') || '- (none given)'
const money = (a, cur) => (a ? `${cur || 'USD'} ${Number(String(a).replace(/[^0-9.]/g, '') || 0).toLocaleString('en-US')}` : '')

function factsFor(kind, a, confirmed) {
  const today = new Date().toISOString().slice(0, 10)
  const sign = [a.name, a.title && `${a.title}`, a.company, a.phone, a.website].filter(Boolean).join(', ')
  const head = `# ${kind === 'round' ? 'Facts for outreach' : 'The offer'} (the ONLY claims drafts may use)\n\nCONFIRMED: ${confirmed ? 'yes' : 'no'}\n<!-- Written by Billy Boy from the answers in Billy's room. Change them there, not here. -->\n\nAs of: ${today}\n\n## Sign-off\n${line('Signature', sign)}\n`
  if (kind === 'round') return head + `
## The round
${line('Raising', money(a.raising, a.currency))}
${line('Instrument', a.instrument)}
${line('Valuation or cap', a.valuation)}
${line('Smallest cheque', a.minTicket && money(a.minTicket, a.currency))}
${line('Lead', a.lead)}
${line('Committed so far', money(a.committed || 0, a.currency))}
${line('Target close', a.close)}
${line('Deck link to paste in emails', a.deck)}

## Traction
${line('Revenue', a.revenue)}
${line('Growth', a.growth)}
${line('Customers or users', a.customers)}
${line('Burn and runway', a.burn)}
${line('Team', a.team)}

## Answers investors always want
${line('Why now', a.whyNow)}
${line('Why you', a.whyYou)}
${line('Use of funds', a.useOfFunds)}

## Proof points to rotate in follow-ups
${list(a.proof)}
`
  return head + `
## Who we sell to
${line('Industries', a.industries)}
${line('Where', a.places)}
${line('Company size', a.size)}
${line('Titles to write to (in order)', a.titles)}
- Triggers that make a company a good fit right now:
${list(a.triggers)}
- Never contact:
${list(a.never)}

## What we sell
${line('In one sentence', a.oneLiner)}
- Prices we are happy to quote:
${list(a.prices)}
${line('What a first project usually looks like', a.firstProject)}

## Proof (real, approved to mention)
${list(a.proof)}

## The seller
${line('Booking link', a.booking)}
${line('Hours for meetings', a.hours)}

## Targets
${line('Meetings booked per month', a.meetings)}
`
}

function defaultFolder(app, kind, company) {
  const safe = (company || (kind === 'round' ? 'Investor round' : 'Sales')).replace(/[<>:"/\\|?*]/g, '').trim()
  return path.join(app.getPath('documents'), 'Billy Boy', `${safe} ${kind === 'round' ? 'round' : 'sales'}`)
}

/** Writes (or rewrites) the folder for a guided outreach face. Returns the state file path. */
function apply({ kitDir, folder, kind, answers, confirmed, managed }) {
  fs.mkdirSync(folder, { recursive: true })
  for (const f of ['PLAYBOOK.md']) {
    const to = path.join(folder, f)
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(kitDir, f), to)       // never replace a playbook
  }
  const factsName = kind === 'round' ? 'facts.md' : 'offer.md'
  const factsPath = path.join(folder, factsName)
  if (fs.existsSync(factsPath) && !managed) {
    const keep = path.join(folder, factsName.replace('.md', '.before-billy.md'))
    if (!fs.existsSync(keep)) fs.copyFileSync(factsPath, keep)
  }
  fs.writeFileSync(factsPath, factsFor(kind, answers, confirmed))

  const statePath = path.join(folder, 'billy_state.json')
  let state = null
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^﻿/, '')) } catch {}
  const goal = kind === 'round'
    ? { label: 'Round', done: Number(String(answers.committed || 0).replace(/[^0-9.]/g, '')) || 0, target: Number(String(answers.raising || 0).replace(/[^0-9.]/g, '')) || 0, unit: answers.currency || 'USD' }
    : { label: 'Meetings this month', done: state?.goal?.done || 0, target: Number(answers.meetings) || 12 }
  if (!state || !state.updated_at) {
    // Nothing has run yet: Billy shows the one step left, in the app, not a file.
    const steps = [{ title: 'Run your agent for the first time', subtitle: 'Click to see how. It writes drafts only; you send them.', setup: 'agent', urgency: 'warn' }]
    if (!confirmed) steps.unshift({ title: 'Confirm your facts', subtitle: 'Your agent writes no new outreach until you do.', setup: 'facts', urgency: 'warn' })
    state = {
      value: String(steps.length), caption: 'to finish', urgency: 'warn', count: steps.length, goal,
      funnel: (kind === 'round' ? ['Found', 'Contacted', 'Talking', 'Meetings', 'Committed'] : ['Found', 'Contacted', 'Replied', 'Meetings', 'Won']).map((label) => ({ label, count: 0 })),
      items: steps, updated_at: null,
    }
  } else {
    state.goal = { ...(state.goal || {}), ...goal }
  }
  // Setup to-dos are done once the facts are confirmed; take them off Billy.
  if (confirmed && Array.isArray(state.items)) {
    const before = state.items.length
    state.items = state.items.filter((it) => it.setup !== 'you' && it.setup !== 'facts')
    if (state.items.length !== before && /^\d+$/.test(String(state.value ?? ''))) {
      const n = Math.max(0, Number(state.value) - (before - state.items.length))
      state.value = String(n); state.count = n
      if (!state.items.some((it) => it.urgency === 'alert')) state.urgency = n ? 'warn' : 'calm'
    }
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
  return statePath
}

module.exports = { STEPS, apply, defaultFolder, factsFor }
