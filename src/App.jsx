import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  BookUser,
  BriefcaseBusiness,
  CalendarDays,
  CakeSlice,
  Check,
  ChevronLeft,
  ChevronRight,
  ContactRound,
  FileUp,
  Gift,
  Heart,
  Home,
  Lightbulb,
  Mic,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react'

const peopleSeed = [
  {
    id: 1,
    name: 'Maya',
    relationship: 'Partner',
    initials: 'M',
    color: '#d98e78',
    birthday: 'March 12',
    nextEvent: 'Interview today',
    memory: 'Loves sunflowers and silver jewelry',
    likes: ['Sunflowers', 'Thai food', 'Silver jewelry'],
    dates: [
      { label: 'Birthday', value: 'March 12' },
      { label: 'Our anniversary', value: 'October 8' },
    ],
    notes: [
      'Wants to visit Montreal someday.',
      'Big interview this afternoon — ask how it went.',
    ],
  },
  {
    id: 2,
    name: 'Mom',
    relationship: 'Family',
    initials: 'M',
    color: '#86a798',
    birthday: 'November 4',
    nextEvent: 'Birthday in 6 weeks',
    memory: 'Looking for a new pottery class',
    likes: ['Pottery', 'Gardening', 'Mystery books'],
    dates: [{ label: 'Birthday', value: 'November 4' }],
    notes: ['Ask about the new rose bushes.', 'Gift idea: local pottery workshop.'],
  },
  {
    id: 3,
    name: 'Jake',
    relationship: 'Friend',
    initials: 'J',
    color: '#8ea1b6',
    birthday: 'January 19',
    nextEvent: 'Moving next Saturday',
    memory: 'Coffee at Atlas is his favorite',
    likes: ['Trail running', 'Vinyl', 'Dark roast'],
    dates: [{ label: 'Birthday', value: 'January 19' }],
    notes: ['Offer to help with the move.', 'Send the playlist from our road trip.'],
  },
  {
    id: 4,
    name: 'Olivia',
    relationship: 'Extended family',
    initials: 'O',
    color: '#b291a4',
    birthday: 'July 27',
    nextEvent: 'No upcoming events',
    memory: "Maya's sister · studying architecture",
    likes: ['Architecture', 'Matcha'],
    dates: [{ label: 'Birthday', value: 'July 27' }],
    notes: ['Graduates next spring.'],
  },
]

const upcoming = [
  { day: 'TODAY', date: '14', person: 'Maya', title: 'Interview day', meta: 'Follow up this evening', color: '#d98e78', icon: Star },
  { day: 'SAT', date: '19', person: 'Jake', title: 'Moving day', meta: 'Offer to help · 9:00 AM', color: '#8ea1b6', icon: Home },
  { day: 'OCT', date: '08', person: 'Maya', title: 'Your anniversary', meta: '24 days away', color: '#b291a4', icon: Heart },
  { day: 'NOV', date: '04', person: 'Mom', title: "Mom's birthday", meta: 'Gift reminder set', color: '#86a798', icon: CakeSlice },
]

const tabs = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays },
  { id: 'relationships', label: 'People', icon: Users },
  { id: 'add', label: 'Add', icon: Plus },
]

const importSources = [
  { id: 'contacts', name: 'Phone contacts', detail: 'Names, photos, birthdays and numbers', icon: ContactRound, tone: 'sage' },
  { id: 'linkedin', name: 'LinkedIn', detail: 'Upload your official Connections CSV', icon: BriefcaseBusiness, tone: 'blue' },
  { id: 'facebook', name: 'Facebook', detail: 'Upload your Facebook information export', icon: BookUser, tone: 'indigo' },
]

function ImportSources({ onImported, compact = false }) {
  const fileInput = useRef(null)
  const [source, setSource] = useState('linkedin')

  const chooseFile = sourceId => {
    setSource(sourceId)
    window.setTimeout(() => fileInput.current?.click(), 0)
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

  const handleFile = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    let count = 0
    if (file.name.toLowerCase().endsWith('.csv')) {
      const rows = (await file.text()).split(/\r?\n/).filter(row => row.trim())
      count = Math.max(0, rows.length - 1)
    }
    onImported(source === 'linkedin' ? 'LinkedIn' : 'Facebook', count)
    event.target.value = ''
  }

  return (
    <div className={`import-sources ${compact ? 'compact-imports' : ''}`}>
      <input ref={fileInput} className="hidden-file" type="file" accept={source === 'linkedin' ? '.csv' : '.zip,.json,.html'} onChange={handleFile} />
      {importSources.map(item => {
        const Icon = item.icon
        return (
          <button className="import-source" key={item.id} onClick={() => item.id === 'contacts' ? importPhoneContacts() : chooseFile(item.id)}>
            <span className={`source-icon ${item.tone}`}><Icon size={20} /></span>
            <span><strong>{item.name}</strong><small>{item.detail}</small></span>
            {item.id === 'contacts' ? <ArrowRight size={17} /> : <FileUp size={17} />}
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

function Today({ onOpen, onAdd }) {
  return (
    <main className="page">
      <Header
        eyebrow="14 September 2026 · Monday"
        title={<>Today, <span>Parker</span></>}
        action={<button className="icon-button" aria-label="Notifications"><Bell size={19} /></button>}
      />

      <section className="hero-card">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-icon"><Sparkles size={19} /></div>
        <p className="kicker">Filed under · Maya</p>
        <h2>Maya’s interview is today.</h2>
        <p>From your note on September 8: she said she was nervous about the final round.</p>
        <div className="hero-actions">
          <button className="primary-button"><Send size={16} /> Text Maya</button>
          <button className="text-button">Move to tonight</button>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="kicker">Your people</p>
            <h2>On today’s page</h2>
          </div>
          <button className="link-button">See all <ChevronRight size={15} /></button>
        </div>
        <div className="people-row">
          {peopleSeed.slice(0, 3).map((person, index) => (
            <button className="person-tile" key={person.id} onClick={() => onOpen(person)}>
              <div className="avatar-wrap">
                <Avatar person={person} size="lg" />
                {index === 0 && <span className="status-dot" />}
              </div>
              <strong>{person.name}</strong>
              <span>{index === 0 ? 'Interview today' : index === 1 ? 'Call this week' : 'Moving soon'}</span>
            </button>
          ))}
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
          {upcoming.slice(1, 3).map((event) => <EventRow event={event} key={event.title} />)}
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

function Upcoming() {
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
        <div className="event-list">{upcoming.map(event => <EventRow event={event} key={event.title} />)}</div>
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
      </div>
    </main>
  )
}

function PersonDetail({ person, onBack }) {
  const [note, setNote] = useState('')
  const [notes, setNotes] = useState(person.notes)
  const addNote = () => {
    if (!note.trim()) return
    setNotes(prev => [note.trim(), ...prev])
    setNote('')
  }
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
        {person.dates.map(date => <div className="info-row" key={date.label}><span className="info-icon rose"><CalendarDays size={17} /></span><div><small>{date.label}</small><strong>{date.value}</strong></div><Bell size={16} /></div>)}
      </section>
      <section className="detail-section">
        <div className="section-heading"><h2>Little things they love</h2><button className="tiny-add"><Plus size={15} /> Add</button></div>
        <div className="tag-list">{person.likes.map(like => <span key={like}>{like}</span>)}</div>
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

  const detected = useMemo(() => {
    const lower = text.toLowerCase()
    const known = people.filter(p => lower.includes(p.name.toLowerCase()))
    const dateMatch = text.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i)
    return { known, date: dateMatch?.[0] }
  }, [text, people])

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

  if (review) return (
    <main className="page">
      <Header eyebrow="One last look" title="Here’s what I found" action={<button className="icon-button" onClick={() => setReview(false)}><X size={19} /></button>} />
      <div className="review-source"><span>Original note</span><p>{text}</p></div>
      <section className="review-list">
        {(detected.known.length ? detected.known : [{ name: 'New person', relationship: 'Needs your review', color: '#b291a4', initials: '?' }]).map(person => (
          <article className="review-card" key={person.name}>
            <div className="review-check"><Check size={15} /></div><Avatar person={person} />
            <div><small>Person</small><strong>{person.name}</strong><span>{person.relationship}</span></div>
          </article>
        ))}
        <article className="review-card">
          <div className="review-check"><Check size={15} /></div><div className="review-symbol"><Lightbulb size={18} /></div>
          <div><small>Memory</small><strong>Save this note</strong><span>Add to the related people</span></div>
        </article>
        {detected.date && <article className="review-card"><div className="review-check"><Check size={15} /></div><div className="review-symbol"><CalendarDays size={18} /></div><div><small>Possible date</small><strong>{detected.date}</strong><span>Suggest a reminder</span></div></article>}
      </section>
      <button className="primary-button wide sticky-save" onClick={() => { const savedText = text; setText(''); setReview(false); onSaved(savedText) }}><Sparkles size={17} /> Add to Keepsake</button>
    </main>
  )

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
      <button className="primary-button wide" disabled={!text.trim()} onClick={() => setReview(true)}><Sparkles size={17} /> Organize this note</button>
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
  const [people, setPeople] = useState(peopleSeed)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = message => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  useEffect(() => {
    fetch('/api/people')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Could not load people')))
      .then(({ people: savedPeople }) => {
        if (!savedPeople?.length) return
        const existingNames = new Set(peopleSeed.map(person => person.name.toLowerCase()))
        const hydrated = savedPeople
          .filter(person => !existingNames.has(person.name.toLowerCase()))
          .map(person => ({
            ...person,
            initials: person.name[0].toUpperCase(),
            nextEvent: 'Nothing scheduled yet',
            memory: 'A new person in your circle',
            likes: [],
            dates: [],
            notes: [],
          }))
        setPeople([...peopleSeed, ...hydrated])
      })
      .catch(() => showToast('Working offline — changes may not sync'))
  }, [])

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

  const saveNote = async rawText => {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, source: 'manual' }),
      })
      if (!response.ok) throw new Error('Could not save note')
      setTab('today')
      showToast('Your note is safely stored')
    } catch {
      showToast('Could not save that note yet')
    }
  }

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
  else if (tab === 'today') content = <Today onOpen={setSelected} onAdd={() => setTab('add')} />
  else if (tab === 'upcoming') content = <Upcoming />
  else if (tab === 'relationships') content = <Relationships people={people} onOpen={setSelected} onCreate={() => setCreating(true)} />
  else content = <AddMemory people={people} onImported={handleImport} onSaved={saveNote} />

  return (
    <div className="app-shell">
      <div className="brand-rail"><div className="brand-mark"><Heart size={18} fill="currentColor" /></div><span>Keepsake</span></div>
      <div className="app-content">{content}</div>
      {!selected && !creating && <nav className="tab-bar">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span className={item.id === 'add' ? 'add-tab-icon' : ''}><Icon size={21} /></span><small>{item.label}</small></button> })}</nav>}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}
