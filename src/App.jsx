import { useEffect, useMemo, useRef, useState } from 'react'
import { buildCalendarMonth, mapReminderToEvent, recordsFromCsv } from './lib/upcoming.js'
import {
  ArrowRight,
  Bell,
  BellOff,
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

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
}

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
    if (window.location.hash === '#import=google-error') {
      window.history.replaceState(null, '', window.location.pathname)
      onImported('Google contacts', 0, 'Google refused the connection. Try again.')
      return
    }
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
    if (!navigator.contacts?.select) {
      onImported('Phone contacts', 0, 'Phone contact access will be available in the installed mobile app.')
      return
    }
    let picked
    try {
      picked = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true })
    } catch {
      // The user closed the native contact picker.
      return
    }
    const first = value => (Array.isArray(value) ? value[0] : value || '').trim()
    const records = picked.map(contact => {
      const name = first(contact.name)
      if (!name) return null
      const record = { name }
      if (first(contact.email)) record.email = first(contact.email)
      if (first(contact.tel)) record.phone = first(contact.tel)
      return record
    }).filter(Boolean).map((record, _idx) => ({ ...record, _idx }))
    if (!records.length) {
      onImported('Phone contacts', 0, 'No usable contacts selected.')
      return
    }
    try {
      const response = await fetch('/api/imports/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'Phone contacts', records }),
      })
      if (!response.ok) throw new Error('Review unavailable.')
      setReview({ source: 'Phone contacts', records, result: await response.json() })
    } catch {
      onImported('Phone contacts', 0, 'Could not review those contacts yet.')
    }
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
  if (person.avatar_url) {
    return (
      <div className={`avatar avatar-${size} avatar-photo`}>
        <img src={person.avatar_url} alt="" />
      </div>
    )
  }
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

function AuthModal({ user, onClose, onAuth, onLogout, onDeleteAccount, authError, onClearError, required = false }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [tokens, setTokens] = useState([])
  const [tokenName, setTokenName] = useState('')
  const [revealedToken, setRevealedToken] = useState('')
  const accountExists = authError?.toLowerCase().includes('already registered')

  useEffect(() => {
    if (!user) return
    fetch('/api/tokens')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('offline')))
      .then(({ tokens: saved }) => setTokens(saved || []))
      .catch(() => {})
  }, [user])

  const createToken = async () => {
    try {
      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tokenName.trim() || 'MCP access' }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not create that token.')
      setTokens(prev => [...prev, payload.token])
      setRevealedToken(payload.token.token)
      setTokenName('')
    } catch {
      setRevealedToken('')
    }
  }

  const revokeToken = async id => {
    await fetch(`/api/tokens/${id}`, { method: 'DELETE' }).catch(() => {})
    setTokens(prev => prev.filter(token => token.id !== id))
  }

  useEffect(() => {
    if (mode === 'signup' && accountExists) setMode('login')
  }, [accountExists, mode])

  const switchMode = () => {
    onClearError?.()
    setMode(current => current === 'login' ? 'signup' : 'login')
  }
  return (
    <div className={`auth-overlay ${required ? 'auth-required' : ''}`} onClick={required ? undefined : onClose}>
      <div className="auth-sheet" onClick={e => e.stopPropagation()}>
        <div className="section-heading"><div><p className="kicker">Your private account</p><h2>{user ? 'Signed in' : mode === 'login' ? 'Welcome back' : 'Create an account'}</h2></div>{!required && <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>}</div>
        {user
          ? <>
            <p className="intro">Signed in as {user.email || user.display_name}. Your notes and people save to your account on this device and server.</p>
            <button className="primary-button wide" onClick={onLogout}>Sign out</button>
            <div className="token-section">
              <p className="kicker">Assistant access</p>
              <p className="token-blurb">Let Claude, ChatGPT, or Gemini read your circle over MCP. A token reads everything you can read, so only connect assistants you trust.</p>
              {tokens.map(token => (
                <div className="token-row" key={token.id}><span>{token.name}</span><button className="text-button" onClick={() => revokeToken(token.id)}>Revoke</button></div>
              ))}
              {revealedToken && <div className="token-secret"><span>Copy it now, it shows once</span><strong>{revealedToken}</strong></div>}
              <div className="quick-note"><input value={tokenName} onChange={e => setTokenName(e.target.value)} placeholder="Token name, e.g. Claude" /><button onClick={createToken} aria-label="Create token"><Plus size={18} /></button></div>
            </div>
            {!confirmingDelete
              ? <button className="text-button auth-danger" onClick={() => setConfirmingDelete(true)}>Delete my account</button>
              : <>
                <p className="auth-error">This permanently deletes your circle, notes, and reminders.</p>
                <button className="text-button auth-danger" onClick={() => { setConfirmingDelete(false); onDeleteAccount?.() }}>Yes, delete everything</button>
              </>}
          </>
          : <>
            <p className="intro">One account keeps your circle in sync. Nothing here is shared or scraped.</p>
            {mode === 'signup' && <label className="auth-field"><span>Name</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="What should we call you?" /></label>}
            <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <label className="auth-field"><span>Password</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ characters" /></label>
            {authError && <p className="auth-error" role="alert">{accountExists && mode === 'login' ? 'That account already exists. Sign in with your existing password below.' : authError}</p>}
            <button className="primary-button wide" disabled={!email.trim() || password.length < 8} onClick={() => onAuth(mode, { email: email.trim(), password, displayName: displayName.trim() })}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button className="text-button auth-switch" onClick={switchMode}>{mode === 'login' ? 'New here? Create an account' : 'Already have one? Sign in'}</button>
          </>}
      </div>
    </div>
  )
}

function Today({ onOpen, onAdd, onShowPeople, onOpenPerson, user, onAccount, comingUp, people, checkins, notificationState, onNotifications }) {
  const teaser = comingUp?.slice(0, 2) || []
  const firstEvent = teaser[0]
  const firstName = String(user?.display_name || user?.email?.split('@')[0] || 'friend').split(' ')[0]
  const todayLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date())
  return (
    <main className="page">
      <Header
        eyebrow={todayLabel}
        title={<>Today, <span>{firstName}</span></>}
        action={<div className="header-actions"><button className={`icon-button ${notificationState === 'enabled' ? 'notification-enabled' : ''}`} aria-label={notificationState === 'enabled' ? 'Notifications enabled' : 'Enable notifications'} title={notificationState === 'enabled' ? 'Notifications are enabled' : 'Enable free browser notifications'} disabled={notificationState === 'enabling'} onClick={onNotifications}><Bell size={19} /></button><button className="icon-button" aria-label="Account" title={user ? `Signed in as ${user.email || user.display_name}` : 'Sign in'} onClick={onAccount}>{user ? String((user.display_name || user.email || 'P')[0]).toUpperCase() : <ContactRound size={19} />}</button></div>}
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
          {teaser.map((event) => <EventRow event={event} onOpen={onOpenPerson} key={`${event.title}-${event.date}-${event.person}`} />)}
          {!teaser.length && <div className="empty-state"><CalendarDays size={20} /><strong>No upcoming moments yet</strong><span>Dates you confirm from notes will appear here automatically.</span></div>}
        </div>
      </section>

      <button className="capture-prompt" onClick={onAdd}>
        <span className="capture-plus"><Plus size={20} /></span>
        <span><strong>Remember something</strong><small>Type it, paste it, or say it out loud</small></span>
        <Mic size={19} />
      </button>

      {checkins?.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <div>
              <p className="kicker">Worth a check-in</p>
              <h2>Quiet lately</h2>
            </div>
          </div>
          <div className="event-list compact">
            {checkins.slice(0, 3).map(person => (
              <button className="checkin-row" key={person.id} onClick={() => onOpen(people.find(entry => entry.id === person.id) || person)}>
                <span className="checkin-icon"><Heart size={15} /></span>
                <span><strong>{person.name}</strong><small>Nothing together in a while — say hi</small></span>
                <ChevronRight size={18} className="chevron" />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function EventRow({ event, onOpen }) {
  const Icon = event.icon
  if (!onOpen) {
    return (
    <article className="event-row">
      <div className="date-block"><span>{event.day}</span><strong>{event.date}</strong></div>
      <div className="event-marker" style={{ background: event.color }}><Icon size={17} /></div>
      <div className="event-copy"><small>{event.person}</small><strong>{event.title}</strong><span>{event.meta}</span></div>
      <ChevronRight size={18} className="chevron" />
    </article>
    )
  }
  return (
    <button className="event-row event-button" onClick={() => onOpen(event.person)}>
      <div className="date-block"><span>{event.day}</span><strong>{event.date}</strong></div>
      <div className="event-marker" style={{ background: event.color }}><Icon size={17} /></div>
      <div className="event-copy"><small>{event.person}</small><strong>{event.title}</strong><span>{event.meta}</span></div>
      <ChevronRight size={18} className="chevron" />
    </button>
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
      .then(({ reminders }) => {
        // Each important date produces multiple reminder rows (e.g. 2 weeks
        // and 3 days before). Collapse to one event per person · date,
        // keeping the soonest upcoming reminder so the feed stays readable.
        const bestByKey = new Map()
        for (const r of reminders || []) {
          const key = `${r.person_name}|${r.date_label || r.title}`
          const prev = bestByKey.get(key)
          if (!prev || r.remind_at < prev.remind_at) bestByKey.set(key, r)
        }
        setEvents([...bestByKey.values()].sort((a, b) => a.remind_at.localeCompare(b.remind_at)).map(mapReminderToEvent))
      })
      .catch(() => setEvents(null))
  }, [enabled])
  return events
}

// Weekly digest: who has gone quiet. Null while loading or offline,
// so Today simply hides the section instead of flashing.
function useWeeklyDigest(enabled) {
  const [quiet, setQuiet] = useState(null)
  useEffect(() => {
    if (!enabled) {
      setQuiet(null)
      return
    }
    fetch('/api/review/weekly')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('offline')))
      .then(({ quiet: quietPeople }) => setQuiet(quietPeople || []))
      .catch(() => setQuiet(null))
  }, [enabled])
  return quiet
}

function Upcoming({ events, onOpenPerson }) {
  const moments = events || []
  const today = new Date()
  const [monthOffset, setMonthOffset] = useState(0)
  const [picked, setPicked] = useState(null)

  const viewed = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const grid = buildCalendarMonth(viewed.getFullYear(), viewed.getMonth())

  const eventDays = new Set(
    moments
      .map(event => event.remindAt ? new Date(event.remindAt) : null)
      .filter(date => date && date.getFullYear() === viewed.getFullYear() && date.getMonth() === viewed.getMonth())
      .map(date => date.getDate()),
  )

  const shown = picked
    ? moments.filter(event => {
      if (!event.remindAt) return false
      const date = new Date(event.remindAt)
      return date.getFullYear() === picked.year && date.getMonth() === picked.month && date.getDate() === picked.day
    })
    : moments

  const isToday = day => monthOffset === 0 && day === today.getDate()
  const isPicked = day => picked?.year === viewed.getFullYear() && picked?.month === viewed.getMonth() && picked?.day === day

  const tapDay = day => {
    setPicked(prev => (prev?.year === viewed.getFullYear() && prev?.month === viewed.getMonth() && prev?.day === day
      ? null
      : { year: viewed.getFullYear(), month: viewed.getMonth(), day }))
  }

  const reset = () => {
    setMonthOffset(0)
    setPicked(null)
  }

  return (
    <main className="page">
      <Header eyebrow="Your relationship calendar" title="Upcoming" action={<button className="icon-button" aria-label="Back to this month" title="Back to this month" onClick={reset}><CalendarDays size={19} /></button>} />
      <div className="month-switcher"><button aria-label="Previous month" onClick={() => { setMonthOffset(offset => offset - 1); setPicked(null) }}><ChevronLeft size={17} /></button><strong>{grid.label}</strong><button aria-label="Next month" onClick={() => { setMonthOffset(offset => offset + 1); setPicked(null) }}><ChevronRight size={17} /></button></div>
      <div className="mini-calendar">
        {['M','T','W','T','F','S','S'].map((d, i) => <span className="weekday" key={`${d}-${i}`}>{d}</span>)}
        {grid.cells.map((day, i) => day === null
          ? <span className="day-blank" key={`blank-${i}`} />
          : <button key={`${viewed.getFullYear()}-${viewed.getMonth()}-${day}`} className={`${isToday(day) ? 'selected' : ''} ${eventDays.has(day) ? 'has-event' : ''} ${isPicked(day) ? 'picked' : ''}`.trim().replace(/\s+/g, ' ')} onClick={() => tapDay(day)}>{day}</button>)}
      </div>
      <section className="section">
        <div className="section-heading"><div><p className="kicker">{picked ? `${grid.label.split(' ')[0]} ${picked.day}` : 'Next in your circle'}</p><h2>{picked ? 'That day' : 'Moments ahead'}</h2></div>{picked && <button className="link-button" onClick={() => setPicked(null)}>Show all <ChevronRight size={15} /></button>}</div>
        <div className="event-list">{shown.map(event => <EventRow event={event} onOpen={onOpenPerson} key={`${event.title}-${event.date}-${event.person}`} />)}{!shown.length && <div className="empty-state"><CalendarDays size={20} /><strong>{picked ? 'Nothing that day' : 'No reminders scheduled'}</strong><span>{picked ? 'Pick another day or come back to everything.' : 'Confirmed birthdays, anniversaries, and events will collect here.'}</span></div>}</div>
      </section>
    </main>
  )
}

function Relationships({ people, onOpen, onCreate, onDelete }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Everyone')
  const [selected, setSelected] = useState([])
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const pressTimer = useRef(null)
  const justSelected = useRef(false)
  const selecting = selected.length > 0
  const filters = {
    Everyone: () => true,
    Family: person => person.relationship === 'Family' || person.relationship === 'Partner',
    Friends: person => person.relationship === 'Friend',
    Work: person => person.relationship === 'Work',
  }
  const results = people.filter(
    person => filters[filter](person) && `${person.name} ${person.relationship}`.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }, [])

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const startPress = person => {
    cancelPress()
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      justSelected.current = true
      setConfirming(false)
      setSelected(prev => prev.includes(person.id) ? prev : [...prev, person.id])
      if (navigator.vibrate) navigator.vibrate(10)
    }, 500)
  }

  const toggle = person => {
    if (justSelected.current) {
      justSelected.current = false
      return
    }
    if (!selecting) {
      onOpen(person)
      return
    }
    setConfirming(false)
    setSelected(prev => prev.includes(person.id) ? prev.filter(id => id !== person.id) : [...prev, person.id])
  }

  const exitSelect = () => {
    cancelPress()
    setSelected([])
    setConfirming(false)
  }

  const removeSelected = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setDeleting(true)
    try {
      await onDelete(selected)
    } finally {
      setDeleting(false)
    }
    exitSelect()
  }

  return (
    <main className="page">
      <Header
        eyebrow={selecting ? `${selected.length} selected` : `${people.length} people in your circle`}
        title="Relationships"
        action={selecting
          ? <button className="icon-button" aria-label="Done selecting" onClick={exitSelect}><X size={19} /></button>
          : <button className="round-add" onClick={onCreate}><Plus size={20} /></button>}
      />
      <label className="search-box"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find someone" /></label>
      <div className="filter-pills">{['Everyone', 'Family', 'Friends', 'Work'].map(name => <button key={name} className={filter === name ? 'active' : ''} onClick={() => setFilter(name)}>{name}</button>)}</div>
      {selecting && (
        <div className="select-bar">
          <span>{selected.length} {selected.length === 1 ? 'card' : 'cards'}</span>
          <button className="primary-button" disabled={deleting} onClick={removeSelected}>{deleting ? 'Deleting…' : confirming ? 'Tap again to delete' : `Delete (${selected.length})`}</button>
        </div>
      )}
      <div className="card-grid">
        {results.map(person => {
          const isSel = selected.includes(person.id)
          return (
          <button
            className={`relationship-card ${isSel ? 'selected' : ''}`}
            key={person.id}
            onClick={() => toggle(person)}
            onTouchStart={() => startPress(person)}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            onMouseDown={() => startPress(person)}
            onMouseUp={cancelPress}
            onMouseLeave={cancelPress}
            onContextMenu={event => event.preventDefault()}
          >
            {selecting && <span className={`select-box ${isSel ? 'on' : ''}`}>{isSel && <Check size={13} />}</span>}
            <Avatar person={person} size="xl" />
            <span className="relationship-label">{person.relationship}</span>
            <h3>{person.name}</h3>
            <p>{person.memory}</p>
            <div className="next-pill"><CalendarDays size={14} /> {person.nextEvent}</div>
          </button>
          )
        })}
        {!results.length && !selecting && <button className="empty-state empty-card" onClick={onCreate}><Plus size={20} /><strong>{query ? 'No people match that search' : 'Your circle is empty'}</strong><span>{query ? 'Try another name or relationship.' : 'Add someone, then Keepsake can start remembering with you.'}</span></button>}
      </div>
    </main>
  )
}

const detailMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatStoredDate(date) {
  const month = detailMonths[(date.month || 1) - 1]
  return `${month} ${date.day}${date.year ? `, ${date.year}` : ''}`
}

function PersonDetail({ person, onBack, onPhoto }) {
  const [note, setNote] = useState('')
  const [localNotes, setLocalNotes] = useState([])
  const [live, setLive] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [showDateForm, setShowDateForm] = useState(false)
  const [dateLabel, setDateLabel] = useState('Birthday')
  const [dateMonth, setDateMonth] = useState(1)
  const [dateDay, setDateDay] = useState(1)
  const [dateYear, setDateYear] = useState('')
  const [dateError, setDateError] = useState('')
  const [showLikeForm, setShowLikeForm] = useState(false)
  const [likeValue, setLikeValue] = useState('')
  const [likeError, setLikeError] = useState('')
  const photoInput = useRef(null)
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
  const pickPhoto = event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoError('Pick an image file.')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = String(reader.result || '')
      if (dataUrl.length > 700000) {
        setPhotoError('That photo is too big — try a smaller one.')
        return
      }
      setPhotoError('')
      try {
        const response = await fetch(`/api/people/${person.id}/avatar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        })
        if (!response.ok) throw new Error('Could not save that photo.')
        const { person: updated } = await response.json()
        setLive(prev => (prev ? { ...prev, person: { ...prev.person, avatar_url: updated.avatar_url } } : prev))
        onPhoto?.(person.id, updated.avatar_url)
      } catch {
        setPhotoError('Could not save that photo.')
      }
    }
    reader.readAsDataURL(file)
  }
  const saveDate = async () => {
    setDateError('')
    try {
      const response = await fetch(`/api/people/${person.id}/dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: dateLabel.trim(),
          month: Number(dateMonth),
          day: Number(dateDay),
          year: dateYear.trim() === '' ? null : Number(dateYear),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save that date.')
      setLive(prev => (prev ? { ...prev, dates: [...prev.dates, payload.date] } : prev))
      setShowDateForm(false)
      setDateYear('')
    } catch (error) {
      setDateError(error.message)
    }
  }
  const toggleDateReminders = async dateId => {
    try {
      const response = await fetch(`/api/people/${person.id}/dates/${dateId}/reminders/toggle`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not change those reminders.')
      setLive(prev => {
        if (!prev) return prev
        const remaining = prev.reminders.filter(reminder => reminder.important_date_id !== dateId)
        const added = (payload.reminders || []).map(reminder => ({ ...reminder, important_date_id: dateId }))
        return { ...prev, reminders: [...remaining, ...added] }
      })
    } catch (error) {
      setDateError(error.message)
    }
  }
  const saveLike = async () => {    setLikeError('')
    const value = likeValue.trim()
    if (!value) return
    try {
      const response = await fetch(`/api/people/${person.id}/facts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'like', value }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not save that.')
      setLive(prev => (prev ? { ...prev, facts: [...prev.facts, payload.fact] } : prev))
      setLikeValue('')
      setShowLikeForm(false)
    } catch (error) {
      setLikeError(error.message)
    }
  }
  const displayPerson = { ...person, avatar_url: live?.person?.avatar_url || person.avatar_url }
  const dates = live ? live.dates.map(date => ({ id: date.id, label: date.label, value: formatStoredDate(date) })) : person.dates
  const liveReminderDateIds = new Set((live?.reminders || []).map(reminder => reminder.important_date_id))
  const likes = live ? live.facts.filter(fact => fact.category === 'like').map(fact => fact.value) : person.likes
  const notes = [...localNotes, ...(live ? live.notes.map(entry => entry.raw_text) : person.notes)]
  return (
    <main className="page detail-page">
      <button className="back-button" onClick={onBack}><ChevronLeft size={18} /> People</button>
      <div className="profile-hero">
        <input ref={photoInput} className="hidden-file" type="file" accept="image/*" onChange={pickPhoto} />
        <button className="profile-photo-button" onClick={() => photoInput.current?.click()} aria-label={`Change photo for ${person.name}`}>
          <Avatar person={displayPerson} size="xxl" />
        </button>
        {photoError && <p className="auth-error">{photoError}</p>}
        <span>{person.relationship}</span>
        <h1>{person.name}</h1>
        <p>{person.memory}</p>
      </div>
      <section className="detail-section">
        <div className="section-heading"><h2>Important dates</h2><button className="tiny-add" onClick={() => { setDateError(''); setShowDateForm(current => !current) }}><Plus size={15} /> Add</button></div>
        {showDateForm && (
          <div className="inline-form">
            <label className="auth-field"><span>Label</span><input value={dateLabel} onChange={e => setDateLabel(e.target.value)} placeholder="Birthday" /></label>
            <div className="inline-row">
              <label className="auth-field"><span>Month</span><select value={dateMonth} onChange={e => setDateMonth(e.target.value)}>{detailMonths.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
              <label className="auth-field"><span>Day</span><select value={dateDay} onChange={e => setDateDay(e.target.value)}>{Array.from({ length: 31 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{day}</option>)}</select></label>
              <label className="auth-field"><span>Year (optional)</span><input inputMode="numeric" value={dateYear} onChange={e => setDateYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="—" /></label>
            </div>
            {dateError && <p className="auth-error">{dateError}</p>}
            <button className="primary-button wide" onClick={saveDate}>Save date</button>
          </div>
        )}
        {dates.map(date => {
          const muted = date.id ? !liveReminderDateIds.has(date.id) : false
          return <div className="info-row" key={date.id || date.label}><span className="info-icon rose"><CalendarDays size={17} /></span><div><small>{date.label}</small><strong>{date.value}</strong></div>{date.id
            ? <button className="bell-button" aria-label={muted ? `Remind me about ${date.label}` : `Mute ${date.label} reminders`} title={muted ? 'Reminders off — tap to turn on' : 'Reminders on — tap to mute'} onClick={() => toggleDateReminders(date.id)}>{muted ? <BellOff size={16} /> : <Bell size={16} />}</button>
            : <Bell size={16} />}</div>
        })}
        {dates.length === 0 && !showDateForm && <p className="empty-line">Nothing saved yet.</p>}
      </section>
      <section className="detail-section">
        <div className="section-heading"><h2>Little things they love</h2><button className="tiny-add" onClick={() => { setLikeError(''); setShowLikeForm(current => !current) }}><Plus size={15} /> Add</button></div>
        {showLikeForm && (
          <div className="inline-form">
            <div className="quick-note"><input value={likeValue} onChange={e => setLikeValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveLike()} placeholder="Sunflowers, Thai food…" /><button onClick={saveLike} aria-label="Save"><Plus size={18} /></button></div>
            {likeError && <p className="auth-error">{likeError}</p>}
          </div>
        )}
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
  const [micNote, setMicNote] = useState('')
  const [review, setReview] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewState, setPreviewState] = useState('idle')
  const [excluded, setExcluded] = useState([])
  const recognitionRef = useRef(null)

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
    setExcluded([])
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
    // Second tap stops the current session instead of stacking a new one.
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      setListening(true)
      setMicNote('')
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognition.onerror = event => {
      setListening(false)
      recognitionRef.current = null
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicNote('Microphone is blocked — allow it in the browser settings.')
      } else if (event.error === 'no-speech') {
        setMicNote('Did not catch that — try again.')
      } else if (event.error === 'audio-capture') {
        setMicNote('No microphone found on this device.')
      } else if (event.error === 'network') {
        setMicNote('Voice needs the secure site — use your https address, not the numbers one.')
      } else {
        setMicNote('Voice is not working right now — typing works too.')
      }
    }
    recognition.onresult = event => {
      setMicNote('')
      setText(prev => `${prev}${prev ? ' ' : ''}${event.results[0][0].transcript}`)
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setListening(false)
      recognitionRef.current = null
    }
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
        {reviewPeople.map(person => {
          const isFallback = person.name === 'New person'
          const off = !isFallback && excluded.includes(person.name)
          return (
          <article className={`review-card ${off ? 'excluded' : ''}`} key={person.name} onClick={() => !isFallback && setExcluded(prev => off ? prev.filter(name => name !== person.name) : [...prev, person.name])} role={isFallback ? undefined : 'button'} tabIndex={isFallback ? undefined : 0} onKeyDown={event => { if (!isFallback && (event.key === 'Enter' || event.key === ' ')) setExcluded(prev => off ? prev.filter(name => name !== person.name) : [...prev, person.name]) }}>
            <div className={`review-check ${off ? 'off' : ''}`}>{!off && <Check size={15} />}</div><Avatar person={person} />
            <div><small>Person</small><strong>{person.name}</strong><span>{off ? 'Skipped — tap to include' : person.sub}</span></div>
          </article>
          )
        })}
        <article className="review-card">
          <div className="review-check"><Check size={15} /></div><div className="review-symbol"><Lightbulb size={18} /></div>
          <div><small>Memory</small><strong>Save this note</strong><span>Add to the related people</span></div>
        </article>
        {dateRows.map(date => <article className="review-card" key={date}><div className="review-check"><Check size={15} /></div><div className="review-symbol"><CalendarDays size={18} /></div><div><small>Possible date</small><strong>{date}</strong><span>Suggest a reminder</span></div></article>)}
      </section>
      <button className="primary-button wide sticky-save" onClick={() => { const savedText = text; const savedExtraction = preview; const included = previewPeople && previewPeople.length ? previewPeople.filter(person => person.name !== 'New person' && !excluded.includes(person.name)).map(person => person.name) : null; setText(''); setReview(false); setPreview(null); setPreviewState('idle'); setExcluded([]); onSaved(savedText, savedExtraction, included) }}><Sparkles size={17} /> Add to Keepsake</button>
      {previewState === 'ready' && reviewPeople.length === 1 && reviewPeople[0].name === 'New person' && <p className="empty-line review-hint">No names in this note, so it saves as-is. Mention someone by name and they will get a card.</p>}
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
          <button className={`mic-button ${listening ? 'listening' : ''}`} onClick={listen}><Mic size={20} /> {listening ? 'Listening… tap to stop' : 'Speak'}</button>
          <span>{micNote || `${text.length} characters`}</span>
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
  const [notificationState, setNotificationState] = useState('idle')
  const liveEvents = useUpcomingReminders(Boolean(user))
  const quietPeople = useWeeklyDigest(Boolean(user))

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
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/push-tokens', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: JSON.stringify(subscription) }),
        })
      }
    } catch {
      // Signing out should still succeed if notification cleanup is offline.
    }
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    setPeople([])
    setNotificationState('idle')
    setAccountOpen(false)
    showToast('Signed out on this device')
  }

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch('/api/auth/account', { method: 'DELETE' })
      if (!response.ok) throw new Error('Could not delete that account yet.')
    } catch {
      showToast('Could not delete that account yet.')
      return
    }
    setUser(null)
    setPeople([])
    setNotificationState('idle')
    setAccountOpen(false)
    showToast('Your account and everything in it is deleted')
  }

  const reloadPeople = async () => {
    try {
      const response = await fetch('/api/people')
      if (!response.ok) return
      const { people: savedPeople } = await response.json()
      setPeople((savedPeople || []).map(person => ({
        ...person,
        initials: person.name[0].toUpperCase(),
        nextEvent: 'Nothing scheduled yet',
        memory: 'A new person in your circle',
        likes: [],
        dates: [],
        notes: [],
      })))
    } catch {
      // The circle keeps showing what it already has while offline.
    }
  }

  useEffect(() => {
    refreshMe()
  }, [])

  useEffect(() => {
    if (!user) return
    reloadPeople().catch(() => showToast('Working offline — changes may not sync'))
  }, [user])

  useEffect(() => {
    if (!user || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    navigator.serviceWorker.register('/sw.js')
      .then(registration => registration.pushManager.getSubscription())
      .then(subscription => setNotificationState(subscription ? 'enabled' : 'idle'))
      .catch(() => setNotificationState('idle'))
  }, [user])

  const enableNotifications = async ({ silent = false } = {}) => {
    const complain = message => {
      if (!silent) showToast(message)
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      complain('This browser does not support notifications')
      return
    }
    if (Notification.permission === 'denied') {
      complain('Notifications are blocked in your browser settings')
      return
    }
    setNotificationState('enabling')
    try {
      const keyResponse = await fetch('/api/push/public-key')
      const keyPayload = await keyResponse.json()
      if (!keyResponse.ok) throw new Error(keyPayload.error || 'Notifications are not configured yet')
      const registration = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(keyPayload.publicKey),
      })
      const saveResponse = await fetch('/api/push-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: JSON.stringify(subscription), platform: 'web' }),
      })
      if (!saveResponse.ok) throw new Error('Could not save this browser')
      setNotificationState('enabled')
      showToast('Notifications are on for this browser')
    } catch (error) {
      setNotificationState('idle')
      complain(error.message || 'Could not enable notifications')
    }
  }

  // Ask once, on its own, the first time a signed-in user lands past
  // onboarding. The button stays as the fallback for later.
  useEffect(() => {
    if (!user || !authReady || onboarding) return
    if (localStorage.getItem('keepsake-notify-asked')) return
    if (!('Notification' in window) || Notification.permission !== 'default') return
    localStorage.setItem('keepsake-notify-asked', 'true')
    enableNotifications({ silent: true })
  }, [user, authReady, onboarding])

  const openEventPerson = name => {
    const match = people.find(person => person.name.toLowerCase() === String(name || '').toLowerCase())
    if (match) setSelected(match)
  }

  const deletePeople = async ids => {    try {
      await Promise.all(ids.map(async id => {
        const response = await fetch(`/api/people/${id}`, { method: 'DELETE' })
        if (!response.ok) throw new Error('Could not delete yet')
      }))
      setPeople(prev => prev.filter(person => !ids.includes(person.id)))
      setSelected(prev => (prev && ids.includes(prev.id) ? null : prev))
      showToast(ids.length === 1 ? 'Removed from your circle' : `${ids.length} removed from your circle`)
    } catch {
      showToast('Could not delete yet')
      throw new Error('Could not delete yet')
    }
  }

  const addPerson = async (name, relationship) => {    try {
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
    reloadPeople()
  }

  const saveNote = async (rawText, reviewedExtraction = null, includedNames = null) => {
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
        const indexed = (extraction.people || []).map((entry, i) => ({ entry, i }))
        const kept = includedNames ? indexed.filter(({ entry }) => includedNames.includes(entry.name)) : indexed
        const remapped = new Map(kept.map(({ i }, n) => [i, n]))
        const peoplePayload = kept.map(({ entry }) => {
          const match = people.find(person => person.name.toLowerCase() === String(entry.name || '').toLowerCase())
          return { name: entry.name, relationship: entry.relationship, personId: match?.id, confidence: entry.confidence }
        })
        const facts = kept.flatMap(({ entry, i }) => (entry.facts || []).map(fact => ({ person: remapped.get(i), ...fact })))
        const dates = kept.flatMap(({ entry, i }) => (entry.dates || []).map(date => ({ person: remapped.get(i), ...date })))
        const confirm = await fetch(`/api/notes/${payload.note.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ people: peoplePayload, facts, dates }),
        })
        if (!confirm.ok) throw new Error('Could not confirm note')
        const { people: newCards } = await confirm.json()
        reloadPeople()
        setTab('today')
        showToast(newCards?.length ? `${newCards.length} ${newCards.length === 1 ? 'person' : 'people'} added to your circle` : 'Your note is safely stored')
      } else {
        setTab('today')
        showToast('Your note is safely stored')
      }
    } catch {
      showToast('Could not save that note yet')
    }
  }

  if (!authReady) return <div className="app-shell auth-loading"><div className="auth-loading-mark"><Heart size={20} fill="currentColor" /></div><span>Opening your Keepsake…</span></div>

  if (!user) return (
    <div className="app-shell auth-gate">
      <div className="brand-rail"><div className="brand-mark"><Heart size={18} fill="currentColor" /></div><span>Keepsake</span></div>
      <AuthModal required user={null} authError={authError} onClearError={() => setAuthError('')} onAuth={handleAuth} />
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
  if (selected) content = <PersonDetail person={selected} onBack={() => setSelected(null)} onPhoto={(id, avatar_url) => setPeople(prev => prev.map(entry => entry.id === id ? { ...entry, avatar_url } : entry))} />
  else if (creating) content = <AddPerson onCancel={() => setCreating(false)} onSave={addPerson} />
  else if (tab === 'today') content = <Today onOpen={setSelected} onAdd={() => setTab('add')} onShowPeople={() => setTab('relationships')} onOpenPerson={openEventPerson} user={user} onAccount={() => { setAuthError(''); setAccountOpen(true) }} comingUp={liveEvents} people={people} checkins={quietPeople} notificationState={notificationState} onNotifications={enableNotifications} />
  else if (tab === 'upcoming') content = <Upcoming events={liveEvents} onOpenPerson={openEventPerson} />
  else if (tab === 'relationships') content = <Relationships people={people} onOpen={setSelected} onCreate={() => setCreating(true)} onDelete={deletePeople} />
  else content = <AddMemory people={people} onImported={handleImport} onSaved={saveNote} />

  return (
    <div className="app-shell">
      <div className="brand-rail"><div className="brand-mark"><Heart size={18} fill="currentColor" /></div><span>Keepsake</span></div>
      <div className="app-content">{content}</div>
      {!selected && !creating && <nav className="tab-bar">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span className={item.id === 'add' ? 'add-tab-icon' : ''}><Icon size={21} /></span><small>{item.label}</small></button> })}</nav>}
      {accountOpen && <AuthModal user={user} authError={authError} onClearError={() => setAuthError('')} onClose={() => setAccountOpen(false)} onAuth={handleAuth} onLogout={handleLogout} onDeleteAccount={handleDeleteAccount} />}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}
