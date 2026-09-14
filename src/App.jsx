import { useEffect, useMemo, useRef, useState } from 'react'
import { mapReminderToEvent, recordsFromCsv } from './lib/upcoming.js'
import {
  ArrowRight,
  Bell,
  BookUser,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  FileUp,
  Globe,
  Heart,
  Home,
  Lightbulb,
  Mic,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'

const tabs = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { id: 'relationships', label: 'People', icon: Users },
  { id: 'add', label: 'Add', icon: Plus },
]

const importSources = [
  { id: 'contacts', name: 'Phone contacts', detail: 'Names, photos, birthdays and numbers', icon: ContactRound, tone: 'sage' },
  { id: 'google', name: 'Google contacts', detail: 'Sync the Google account you choose', icon: Globe, tone: 'blue' },
  { id: 'linkedin', name: 'LinkedIn', detail: 'Upload your official Connections CSV', icon: BriefcaseBusiness, tone: 'blue' },
  { id: 'facebook', name: 'Facebook', detail: 'Upload your Facebook information export', icon: BookUser, tone: 'indigo' },
]

const reasonWords = { 'exact-name': 'same name', email: 'same email', phone: 'same number' }

function ImportReview({ source, records, result, onConfirm, onBack }) {
  const [choices, setChoices] = useState(() => Object.fromEntries(result.candidates.map((_, i) => [i, 'merge'])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const merges = result.candidates.filter((_, i) => choices[i] === 'merge').length
  const creates = result.fresh.length + result.candidates.filter((_, i) => choices[i] === 'create').length

  const confirm = async () => {
    setSaving(true)
    setError('')
    try {
      const resolutions = []
      result.candidates.forEach((candidate, i) => {
        const choice = choices[i]
        if (choice === 'skip') resolutions.push({ index: candidate.incoming._idx, action: 'skip' })
        else if (choice === 'create') resolutions.push({ index: candidate.incoming._idx, action: 'create' })
        else resolutions.push({ index: candidate.incoming._idx, action: 'merge', personId: candidate.matches[0].person.id })
      })
      result.fresh.forEach(record => resolutions.push({ index: record._idx, action: 'create' }))
      await onConfirm(resolutions)
    } catch {
      setError('Could not finish that import yet.')
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="section-heading"><div><p className="kicker">{source} · {records.length} rows</p><h2>Who goes in?</h2></div><button className="text-button" onClick={onBack}>Back</button></div>
      <p className="intro">{result.fresh.length} new cards{result.candidates.length ? `, ${result.candidates.length} possible duplicates` : ''}{result.skipped ? `, ${result.skipped} rows skipped` : ''}.</p>
      {result.candidates.map((candidate, i) => {
        const match = candidate.matches[0]
        return (
          <article className="merge-card" key={`${candidate.incoming.name}-${i}`}>
            <div><small>Possible duplicate</small><strong>{candidate.incoming.name}</strong><span>Looks like {match.person.name} in your circle ({match.reasons.map(r => reasonWords[r] || r).join(' · ')}). Merge them?</span></div>
            <div className="merge-choices">
              <button className={choices[i] === 'merge' ? 'active' : ''} onClick={() => setChoices(prev => ({ ...prev, [i]: 'merge' }))}>Merge</button>
              <button className={choices[i] === 'create' ? 'active' : ''} onClick={() => setChoices(prev => ({ ...prev, [i]: 'create' }))}>Keep separate</button>
              <button className={choices[i] === 'skip' ? 'active' : ''} onClick={() => setChoices(prev => ({ ...prev, [i]: 'skip' }))}>Skip</button>
            </div>
          </article>
        )
      })}
      {result.fresh.length > 0 && (
        <div className="merge-fresh"><small>New cards</small>{result.fresh.map(record => <span key={record._idx}><Plus size={12} /> {record.name}</span>)}</div>
      )}
      {error && <p className="auth-error">{error}</p>}
      <button className="primary-button wide" disabled={saving || (creates + merges === 0)} onClick={confirm}>{saving ? 'Importing…' : `Import ${creates + merges} ${creates + merges === 1 ? 'person' : 'people'}`}</button>
    </div>
  )
}

function ImportSources({ onImported, compact = false }) {
  const fileInput = useRef(null)
  const [source, setSource] = useState('linkedin')
  const [review, setReview] = useState(null)

  // Returning from Google OAuth lands on #import=google: pull the synced
  // contacts straight into the same review flow as a CSV.
  useEffect(() => {
    if (window.location.hash !== '#import=google') return
    window.history.replaceState(null, '', window.location.pathname)
    fetch('/api/imports/google/preview')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('preview failed')))
      .then(result => {
        const records = [...result.fresh, ...result.candidates.map(candidate => candidate.incoming)]
          .sort((a, b) => a._idx - b._idx)
        setReview({ source: result.source, records, result })
      })
      .catch(() => onImported('Google contacts', 0, 'Google sync hit a snag. Try again.'))
  }, [onImported])

  const chooseFile = sourceId => {
    setSource(sourceId)
    window.setTimeout(() => fileInput.current?.click(), 0)
  }

  const connectGoogle = async () => {
    try {
      const response = await fetch('/api/auth/google')
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Google sync is not set up yet.')
      window.location.href = payload.url
    } catch (error) {
      onImported('Google contacts', 0, error.message)
    }
  }

  const importPhoneContacts = async () => {
    if (navigator.contacts?.select) {
      try {
        const contacts = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true })
        onImported('Phone contacts', contacts.length)
      } catch {
        // The user closed the native contact picker.
      }
      return
    }
    onImported('Phone contacts', 0, 'Phone contact access will be available in the installed mobile app.')
  }

  const confirmImport = async resolutions => {
    const cleanRecords = review.records.map(({ _idx, ...rest }) => rest)
    const response = await fetch('/api/imports/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: review.source, records: cleanRecords, resolutions }),
    })
    if (!response.ok) throw new Error('Could not finish that import yet.')
    const { created, merged } = await response.json()
    const total = created.length + merged.length
    setReview(null)
    onImported(review.source, total, total ? '' : 'Nothing new to import.')
  }

  const handleFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const label = source === 'linkedin' ? 'LinkedIn' : 'Facebook'
    // CSVs get the full review flow: parse, match duplicates, confirm.
    if (file.name.toLowerCase().endsWith('.csv')) {
      try {
        const records = recordsFromCsv(await file.text()).map((record, _idx) => ({ ...record, _idx }))
        if (records.length) {
          const response = await fetch('/api/imports/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: label, records }),
          })
          if (!response.ok) throw new Error('Review unavailable.')
          setReview({ source: label, records, result: await response.json() })
          return
        }
      } catch {
        // Fall through to the count-only path below.
      }
    }
    onImported(label, 0, 'That file is saved for review.')
  }

  if (review) {
    return (
      <div className={`import-sources ${compact ? 'compact-imports' : ''}`}>
        <ImportReview source={review.source} records={review.records} result={review.result} onBack={() => setReview(null)} onConfirm={confirmImport} />
      </div>
    )
  }

  return (
    <div className={`import-sources ${compact ? 'compact-imports' : ''}`}>
      <input ref={fileInput} className="hidden-file" type="file" accept={source === 'linkedin' ? '.csv' : '.zip,.json,.html,.csv'} onChange={handleFile} />
      {importSources.map(item => {
        const Icon = item.icon
        const action = item.id === 'contacts' ? importPhoneContacts : item.id === 'google' ? connectGoogle : () => chooseFile(item.id)
        return (
          <button className="import-source" key={item.id} onClick={action}>
            <span className={`source-icon ${item.tone}`}><Icon size={20} /></span>
            <span><strong>{item.name}</strong><small>{item.detail}</small></span>
            {item.id === 'contacts' ? <ArrowRight size={17} /> : item.id === 'google' ? <ArrowRight size={17} /> : <FileUp size={17} />}
          </button>
        )
      })}
      <p className="source-safety"><ShieldCheck size={14} /> You choose what to import. Keepsake never scrapes social profiles.</p>
    </div>
  )
}

function Onboarding({ onComplete, onImported }) {
  const [step, setStep] = useState(0)
  const [note, setNote] = useState('')

  const finish = () => {
    localStorage.setItem('keepsake-onboarded-v2', 'true')
    onComplete(note)
  }

  return (
    <main className="onboarding">
      <div className="onboarding-top"><div className="onboarding-logo"><Heart size={18} fill="currentColor" /></div><span>Keepsake</span><button onClick={finish}>Skip for now</button></div>
      <div className="step-dots">{[0, 1, 2].map(index => <span className={step === index ? 'active' : step > index ? 'done' : ''} key={index} />)}</div>
      {step === 0 && <section className="onboarding-panel welcome-panel">
        <div className="welcome-art"><div className="orbit-card one">M</div><div className="orbit-card two">J</div><div className="orbit-card three">O</div><Heart size={39} fill="currentColor" /></div>
        <p className="kicker">Remember what matters</p>
        <h1>Your people,<br /><em>beautifully remembered.</em></h1>
        <p>Keepsake turns scattered notes into thoughtful reminders and living profiles for everyone you care about.</p>
        <button className="primary-button wide" onClick={() => setStep(1)}>Begin setup <ArrowRight size={17} /></button>
      </section>}
      {step === 1 && <section className="onboarding-panel">
        <p className="kicker">Step 1 · Start with what you know</p>
        <h1>Pour it all out.</h1>
        <p>Paste your long Google Keep note or type anything you remember. It can be messy.</p>
        <div className="onboarding-composer"><textarea value={note} onChange={event => setNote(event.target.value)} placeholder={'Maya’s birthday is March 12…\nJake is moving next weekend…\nMom mentioned a pottery class…'} /><span><Sparkles size={15} /> We’ll organize people, dates and little details</span></div>
        <button className="primary-button wide" onClick={() => setStep(2)}>{note.trim() ? 'Organize and continue' : 'I’ll add notes later'} <ArrowRight size={17} /></button>
      </section>}
      {step === 2 && <section className="onboarding-panel">
        <p className="kicker">Step 2 · Build your circle</p>
        <h1>Bring in your people.</h1>
        <p>Start with contacts you already have. Keepsake will spot duplicates before creating cards.</p>
        <ImportSources onImported={onImported} />
        <button className="primary-button wide" onClick={finish}>Finish setup <Check size={17} /></button>
      </section>}
    </main>
  )
}

function Avatar({ person, size = 'md' }) {
  return (
    <div className={`avatar avatar-${size}`} style={{ background: person.color }}>
      {person.initials}
    </div>
  )
}

function Header({ eyebrow, title, action }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  )
}

function AuthModal({ user, onClose, onAuth, onLogout, authError, required = false }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  return (
    <div className={`auth-overlay ${required ? 'auth-required' : ''}`} onClick={required ? undefined : onClose}>
      <div className="auth-sheet" onClick={e => e.stopPropagation()}>
        <div className="section-heading"><div><p className="kicker">Your private account</p><h2>{user ? 'Signed in' : mode === 'login' ? 'Welcome back' : 'Create an account'}</h2></div>{!required && <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>}</div>
        {user
          ? <>
            <p className="intro">Signed in as {user.email || user.display_name}. Your notes and people save to your account on this device and server.</p>
            <button className="primary-button wide" onClick={onLogout}>Sign out</button>
          </>
          : <>
            <p className="intro">One account keeps your circle in sync. Nothing here is shared or scraped.</p>
            {mode === 'signup' && <label className="auth-field"><span>Name</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="What should we call you?" /></label>}
            <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <label className="auth-field"><span>Password</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ characters" /></label>
            {authError && <p className="auth-error">{authError}</p>}
            <button className="primary-button wide" disabled={!email.trim() || password.length < 8} onClick={() => onAuth(mode, { email: email.trim(), password, displayName: displayName.trim() })}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button className="text-button auth-switch" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'New here? Create an account' : 'Already have one? Sign in'}</button>
          </>}
      </div>
    </div>
  )
}

function Today({ onOpen, onAdd, onShowPeople, user, onAccount, comingUp, people }) {
  const teaser = comingUp?.slice(0, 2) || []
  const firstEvent = teaser[0]
  const firstName = String(user?.display_name || user?.email?.split('@')[0] || 'friend').split(' ')[0]
  const todayLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date())
  return (
    <main className="page">
      <Header
        eyebrow={todayLabel}
        title={<>Today, <span>{firstName}</span></>}
        action={<div className="header-actions"><button className="icon-button" aria-label="Notifications"><Bell size={19} /></button><button className="icon-button" aria-label="Account" title={user ? `Signed in as ${user.email || user.display_name}` : 'Sign in'} onClick={onAccount}>{user ? String((user.display_name || user.email || 'P')[0]).toUpperCase() : <ContactRound size={19} />}</button></div>}
      />

      <section className="hero-card">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-icon"><Sparkles size={19} /></div>
        <p className="kicker">{firstEvent ? `Coming up · ${firstEvent.person}` : 'Your circle is quiet'}</p>
        <h2>{firstEvent?.title || 'Nothing needs your attention today.'}</h2>
        <p>{firstEvent?.meta || 'Add a person or paste a messy note. Keepsake will surface the moments worth remembering.'}</p>
        {!firstEvent && <div className="hero-actions"><button className="primary-button" onClick={onAdd}><Plus size={16} /> Add a memory</button></div>}
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="kicker">Your people</p>
            <h2>On today’s page</h2>
          </div>
          <button className="link-button" onClick={onShowPeople}>See all <ChevronRight size={15} /></button>
        </div>
        <div className="people-row">
          {people.slice(0, 3).map((person, index) => (
            <button className="person-tile" key={person.id} onClick={() => onOpen(person)}>
              <div className="avatar-wrap">
                <Avatar person={person} size="lg" />
                {index === 0 && <span className="status-dot" />}
              </div>
              <strong>{person.name}</strong>
              <span>{person.nextEvent || 'Nothing scheduled yet'}</span>
            </button>
          ))}
          {!people.length && <button className="empty-inline" onClick={onShowPeople}><Plus size={16} /> Add the first person in your circle</button>}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="kicker">The next few pages</p>
            <h2>Coming up</h2>
          </div>
        </div>
        <div className="event-list compact">
          {teaser.map((event) => <EventRow event={event} key={`${event.title}-${event.date}-${event.person}`} />)}
          {!teaser.length && <div className="empty-state"><CalendarDays size={20} /><strong>No upcoming moments yet</strong><span>Dates you confirm from notes will appear here automatically.</span></div>}
        </div>
      </section>

      <button className="capture-prompt" onClick={onAdd}>
        <span className="capture-plus"><Plus size={20} /></span>
        <span><strong>Remember something</strong><small>Type it, paste it, or say it out loud</small></span>
        <Mic size={19} />
      </button>
    </main>
  )
}

function EventRow({ event }) {
  const Icon = event.icon
  return (
    <article className="event-row">
      <div className="date-block"><span>{event.day}</span><strong>{event.date}</strong></div>
      <div className="event-marker" style={{ background: event.color }}><Icon size={17} /></div>
      <div className="event-copy"><small>{event.person}</small><strong>{event.title}</strong><span>{event.meta}</span></div>
      <ChevronRight size={18} className="chevron" />
    </article>
  )
}

function useUpcomingReminders(enabled) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    if (!enabled) {
      setEvents(null)
      return
    }
    fetch('/api/reminders/upcoming?limit=20')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('offline')))
      .then(({ reminders }) => setEvents((reminders || []).map(mapReminderToEvent)))
      .catch(() => setEvents(null))
  }, [enabled])
  return events
}

function Upcoming({ events }) {
  const moments = events || []
  return (
    <main className="page">
      <Header eyebrow="Your relationship calendar" title="Upcoming" action={<button className="icon-button"><CalendarDays size={19} /></button>} />
      <div className="month-switcher"><button><ChevronLeft size={17} /></button><strong>September 2026</strong><button><ChevronRight size={17} /></button></div>
      <div className="mini-calendar">
        {['M','T','W','T','F','S','S'].map((d, i) => <span className="weekday" key={`${d}-${i}`}>{d}</span>)}
        {[7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(d => <button key={d} className={d === 14 ? 'selected' : d === 19 ? 'has-event' : ''}>{d}</button>)}
      </div>
      <section className="section">
        <div className="section-heading"><div><p className="kicker">Next in your circle</p><h2>Moments ahead</h2></div></div>
        <div className="event-list">{moments.map(event => <EventRow event={event} key={`${event.title}-${event.date}-${event.person}`} />)}{!moments.length && <div className="empty-state"><CalendarDays size={20} /><strong>No reminders scheduled</strong><span>Confirmed birthdays, anniversaries, and events will collect here.</span></div>}</div>
      </section>
    </main>
  )
}

function Relationships({ people, onOpen, onCreate }) {
  const [query, setQuery] = useState('')
  const results = people.filter(person => `${person.name} ${person.relationship}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <main className="page">
      <Header eyebrow={`${people.length} people in your circle`} title="Relationships" action={<button className="round-add" onClick={onCreate}><Plus size={20} /></button>} />
      <label className="search-box"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find someone" /></label>
      <div className="filter-pills"><button className="active">Everyone</button><button>Family</button><button>Friends</button><button>Work</button></div>
      <div className="card-grid">
        {results.map(person => (
          <button className="relationship-card" key={person.id} onClick={() => onOpen(person)}>
            <Avatar person={person} size="xl" />
            <span className="relationship-label">{person.relationship}</span>
            <h3>{person.name}</h3>
            <p>{person.memory}</p>
            <div className="next-pill"><CalendarDays size={14} /> {person.nextEvent}</div>
          </button>
        ))}
        {!results.length && <button className="empty-state empty-card" onClick={onCreate}><Plus size={20} /><strong>{query ? 'No people match that search' : 'Your circle is empty'}</strong><span>{query ? 'Try another name or relationship.' : 'Add someone, then Keepsake can start remembering with you.'}</span></button>}
      </div>
    </main>
  )
}

const detailMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatStoredDate(date) {
  const month = detailMonths[(date.month || 1) - 1]
  return `${month} ${date.day}${date.year ? `, ${date.year}` : ''}`
}

function PersonDetail({ person, onBack }) {
  const [note, setNote] = useState('')
  const [localNotes, setLocalNotes] = useState([])
  const [live, setLive] = useState(null)
  useEffect(() => {
    fetch(`/api/people/${person.id}/details`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('offline')))
      .then(setLive)
      .catch(() => {})
  }, [person.id])
  const addNote = () => {
    if (!note.trim()) return
    setLocalNotes(prev => [note.trim(), ...prev])
    setNote('')
  }
  const dates = live ? live.dates.map(date => ({ label: date.label, value: formatStoredDate(date) })) : person.dates
  const likes = live ? live.facts.filter(fact => fact.category === 'like').map(fact => fact.value) : person.likes
  const notes = [...localNotes, ...(live ? live.notes.map(entry => entry.raw_text) : person.notes)]
  return (
    <main className="page detail-page">
      <button className="back-button" onClick={onBack}><ChevronLeft size={18} /> People</button>
      <div className="profile-hero">
        <Avatar person={person} size="xxl" />
        <span>{person.relationship}</span>
        <h1>{person.name}</h1>
        <p>{person.memory}</p>
      </div>
      <section className="detail-section">
        <div className="section-heading"><h2>Important dates</h2><button className="tiny-add"><Plus size={15} /> Add</button></div>
        {dates.map(date => <div className="info-row" key={date.label}><span className="info-icon rose"><CalendarDays size={17} /></span><div><small>{date.label}</small><strong>{date.value}</strong></div><Bell size={16} /></div>)}
        {dates.length === 0 && <p className="empty-line">Nothing saved yet.</p>}
      </section>
      <section className="detail-section">
        <div className="section-heading"><h2>Little things they love</h2><button className="tiny-add"><Plus size={15} /> Add</button></div>
        <div className="tag-list">{likes.map(like => <span key={like}>{like}</span>)}</div>
        {likes.length === 0 && <p className="empty-line">Nothing saved yet — it arrives here from your notes.</p>}
      </section>
      <section className="detail-section">
        <div className="section-heading"><h2>Notes & memories</h2></div>
        <div className="quick-note"><input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} placeholder={`Remember something about ${person.name}`} /><button onClick={addNote}><Plus size={18} /></button></div>
        <div className="notes-list">{notes.map((item, i) => <article key={`${item}-${i}`}><Lightbulb size={17} /><p>{item}</p></article>)}</div>
      </section>
    </main>
  )
}

function AddPerson({ onCancel, onSave }) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('Friend')
  return (
    <main className="page">
      <Header title="Add someone" action={<button className="icon-button" onClick={onCancel}><X size={19} /></button>} />
      <section className="form-card">
        <div className="new-avatar"><Plus size={24} /></div>
        <label><span>Name</span><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Their name" /></label>
        <label><span>Relationship</span><select value={relationship} onChange={e => setRelationship(e.target.value)}><option>Friend</option><option>Family</option><option>Partner</option><option>Work</option><option>Other</option></select></label>
        <button className="primary-button wide" disabled={!name.trim()} onClick={() => onSave(name.trim(), relationship)}>Add to my circle</button>
      </section>
    </main>
  )
}

function AddMemory({ people, onSaved, onImported }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [review, setReview] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewState, setPreviewState] = useState('idle')

  const detected = useMemo(() => {
    const lower = text.toLowerCase()
    const known = people.filter(p => lower.includes(p.name.toLowerCase()))
    const dateMatch = text.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)
    return { known, date: dateMatch?.[0] }
  }, [text, people])

  const openReview = () => {
    setReview(true)
    setPreview(null)
    setPreviewState('loading')
    fetch('/api/extract/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: text }),
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('preview failed')))
      .then(({ extraction }) => {
        setPreview(extraction)
        setPreviewState('ready')
      })
      .catch(() => setPreviewState('offline'))
  }

  const listen = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setText(prev => `${prev}${prev ? ' ' : ''}Maya mentioned that she wants to try the new Thai place next Friday.`)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.interimResults = false
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onresult = event => setText(prev => `${prev}${prev ? ' ' : ''}${event.results[0][0].transcript}`)
    recognition.start()
  }

  if (review) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const previewPeople = previewState === 'ready' && preview ? (preview.people || []) : null
    const reviewPeople = previewPeople && previewPeople.length
      ? previewPeople.map(entry => {
        const match = people.find(p => p.name.toLowerCase() === String(entry.name || '').toLowerCase())
        const detailBits = [...(entry.facts || []).map(f => f.value), ...(entry.dates || []).map(d => `${d.label} · ${monthNames[(d.month || 1) - 1]} ${d.day}`)]
        return {
          name: entry.name,
          relationship: match?.relationship || entry.relationship || 'Needs your review',
          color: match?.color || '#b291a4',
          initials: match?.initials || String(entry.name || '?')[0].toUpperCase(),
          sub: detailBits.slice(0, 2).join(' · ') || (match ? match.memory : 'New name from this note'),
        }
      })
      : (detected.known.length ? detected.known.map(p => ({ ...p, sub: p.relationship })) : [{ name: 'New person', relationship: 'Needs your review', color: '#b291a4', initials: '?', sub: 'No familiar names found' }])
    const previewDates = previewState === 'ready' && preview ? (preview.people || []).flatMap(entry => (entry.dates || []).map(d => `${entry.name} · ${d.label} · ${monthNames[(d.month || 1) - 1]} ${d.day}`)) : []
    const dateRows = previewDates.length ? previewDates : (detected.date ? [detected.date] : [])
    return (
    <main className="page">
      <Header eyebrow="One last look" title="Here’s what I found" action={<button className="icon-button" onClick={() => setReview(false)}><X size={19} /></button>} />
      <div className="review-source"><span>Original note</span><p>{text}</p></div>
      {previewState === 'loading' && <div className="detection-hint"><Sparkles size={16} /><span>Reading your note against your circle…</span></div>}
      <section className="review-list">
        {reviewPeople.map(person => (
          <article className="review-card" key={person.name}>
            <div className="review-check"><Check size={15} /></div><Avatar person={person} />
            <div><small>Person</small><strong>{person.name}</strong><span>{person.sub}</span></div>
          </article>
        ))}
        <article className="review-card">
          <div className="review-check"><Check size={15} /></div><div className="review-symbol"><Lightbulb size={18} /></div>
          <div><small>Memory</small><strong>Save this note</strong><span>Add to the related people</span></div>
        </article>
        {dateRows.map(date => <article className="review-card" key={date}><div className="review-check"><Check size={15} /></div><div className="review-symbol"><CalendarDays size={18} /></div><div><small>Possible date</small><strong>{date}</strong><span>Suggest a reminder</span></div></article>)}
      </section>
      <button className="primary-button wide sticky-save" onClick={() => { const savedText = text; const savedExtraction = preview; setText(''); setReview(false); setPreview(null); setPreviewState('idle'); onSaved(savedText, savedExtraction) }}><Sparkles size={17} /> Add to Keepsake</button>
    </main>
    )
  }

  return (
    <main className="page add-page">
      <Header eyebrow="No organizing required" title="What do you want to remember?" />
      <p className="intro">Paste a whole note, type a passing thought, or just talk. Keepsake will sort out the people and moments for you.</p>
      <div className="composer">
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={'Start typing anything…\n\n“Maya loves sunflowers. Her interview is next Thursday. Jake is moving on Saturday…”'} />
        <div className="composer-footer">
          <button className={`mic-button ${listening ? 'listening' : ''}`} onClick={listen}><Mic size={20} /> {listening ? 'Listening…' : 'Speak'}</button>
          <span>{text.length} characters</span>
        </div>
      </div>
      {text && <div className="detection-hint"><Sparkles size={16} /><span>{detected.known.length ? `I recognize ${detected.known.map(p => p.name).join(', ')}` : 'I’ll look for people, dates, and memories'}</span></div>}
      <button className="primary-button wide" disabled={!text.trim()} onClick={openReview}><Sparkles size={17} /> Organize this note</button>
      <div className="privacy-note"><Heart size={15} /><span>Your memories are private and always yours.</span></div>
      <div className="add-divider"><span>or bring in people</span></div>
      <section className="add-import-section">
        <div className="section-heading"><div><p className="kicker">Connect & import</p><h2>Build your circle faster</h2></div></div>
        <ImportSources compact onImported={onImported} />
      </section>
    </main>
  )
}

export default function App() {
  const [onboarding, setOnboarding] = useState(() => localStorage.getItem('keepsake-onboarded-v2') !== 'true')
  const [tab, setTab] = useState('today')
  const [people, setPeople] = useState([])
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [authError, setAuthError] = useState('')
  const liveEvents = useUpcomingReminders(Boolean(user))

  const showToast = message => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  const refreshMe = () => {
    fetch('/api/auth/me')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('offline')))
      .then(({ user: me }) => setUser(me))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true))
  }

  const handleAuth = async (mode, fields) => {
    setAuthError('')
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not sign you in.')
      setUser(payload.user)
      setAccountOpen(false)
      showToast(`Welcome, ${payload.user.display_name || 'friend'}`)
    } catch (error) {
      setAuthError(error.message)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    setPeople([])
    setAccountOpen(false)
    showToast('Signed out on this device')
  }

  useEffect(() => {
    refreshMe()
  }, [])

  useEffect(() => {
    if (!user) return
    fetch('/api/people')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Could not load people')))
      .then(({ people: savedPeople }) => {
        const hydrated = (savedPeople || []).map(person => ({
          ...person,
          initials: person.name[0].toUpperCase(),
          nextEvent: 'Nothing scheduled yet',
          memory: 'A new person in your circle',
          likes: [],
          dates: [],
          notes: [],
        }))
        setPeople(hydrated)
      })
      .catch(() => showToast('Working offline — changes may not sync'))
  }, [user])

  const addPerson = async (name, relationship) => {
    try {
      const response = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, relationship }),
      })
      if (!response.ok) throw new Error('Could not save person')
      const { person } = await response.json()
      setPeople(prev => [...prev, { ...person, initials: name[0].toUpperCase(), nextEvent: 'Nothing scheduled yet', memory: 'A new person in your circle', likes: [], dates: [], notes: [] }])
      setCreating(false)
      showToast(`${name} was added to your circle`)
    } catch {
      showToast('Could not save that person yet')
    }
  }

  const handleImport = async (source, count, message) => {
    if (message) {
      showToast(message)
      return
    }
    try {
      await fetch('/api/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, recordCount: count }),
      })
      showToast(count ? `${count} people found in ${source}` : `${source} export added for review`)
    } catch {
      showToast('Import saved locally for now')
    }
  }

  const saveNote = async (rawText, reviewedExtraction = null) => {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, source: 'manual' }),
      })
      if (!response.ok) throw new Error('Could not save note')
      const payload = await response.json()
      const extraction = reviewedExtraction || payload.extraction
      if (extraction && payload.note?.id) {
        const peoplePayload = extraction.people.map(entry => {
          const match = people.find(person => person.name.toLowerCase() === String(entry.name || '').toLowerCase())
          return { name: entry.name, relationship: entry.relationship, personId: match?.id, confidence: entry.confidence }
        })
        const facts = extraction.people.flatMap((entry, person) => (entry.facts || []).map(fact => ({ person, ...fact })))
        const dates = extraction.people.flatMap((entry, person) => (entry.dates || []).map(date => ({ person, ...date })))
        const confirm = await fetch(`/api/notes/${payload.note.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ people: peoplePayload, facts, dates }),
        })
        if (!confirm.ok) throw new Error('Could not confirm note')
      }
      setTab('today')
      showToast('Your note is safely stored')
    } catch {
      showToast('Could not save that note yet')
    }
  }

  if (!authReady) return <div className="app-shell auth-loading"><div className="auth-loading-mark"><Heart size={20} fill="currentColor" /></div><span>Opening your Keepsake…</span></div>

  if (!user) return (
    <div className="app-shell auth-gate">
      <div className="brand-rail"><div className="brand-mark"><Heart size={18} fill="currentColor" /></div><span>Keepsake</span></div>
      <AuthModal required user={null} authError={authError} onAuth={handleAuth} />
    </div>
  )

  if (onboarding) return (
    <div className="app-shell onboarding-shell">
      <Onboarding onImported={handleImport} onComplete={note => {
        setOnboarding(false)
        if (note.trim()) saveNote(note)
      }} />
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )

  let content
  if (selected) content = <PersonDetail person={selected} onBack={() => setSelected(null)} />
  else if (creating) content = <AddPerson onCancel={() => setCreating(false)} onSave={addPerson} />
  else if (tab === 'today') content = <Today onOpen={setSelected} onAdd={() => setTab('add')} onShowPeople={() => setTab('relationships')} user={user} onAccount={() => { setAuthError(''); setAccountOpen(true) }} comingUp={liveEvents} people={people} />
  else if (tab === 'upcoming') content = <Upcoming events={liveEvents} />
  else if (tab === 'relationships') content = <Relationships people={people} onOpen={setSelected} onCreate={() => setCreating(true)} />
  else content = <AddMemory people={people} onImported={handleImport} onSaved={saveNote} />

  return (
    <div className="app-shell">
      <div className="brand-rail"><div className="brand-mark"><Heart size={18} fill="currentColor" /></div><span>Keepsake</span></div>
      <div className="app-content">{content}</div>
      {!selected && !creating && <nav className="tab-bar">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span className={item.id === 'add' ? 'add-tab-icon' : ''}><Icon size={21} /></span><small>{item.label}</small></button> })}</nav>}
      {accountOpen && <AuthModal user={user} authError={authError} onClose={() => setAccountOpen(false)} onAuth={handleAuth} onLogout={handleLogout} />}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}
