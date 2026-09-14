import { useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  CakeSlice,
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  Heart,
  Home,
  Lightbulb,
  Mic,
  Plus,
  Search,
  Send,
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
        eyebrow="Monday, September 14"
        title={<>Good morning, <span>Parker.</span></>}
        action={<button className="icon-button" aria-label="Notifications"><Bell size={19} /></button>}
      />

      <section className="hero-card">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="hero-icon"><Sparkles size={19} /></div>
        <p className="kicker">A gentle nudge</p>
        <h2>Maya has her big interview today.</h2>
        <p>You made a note that she was nervous. A little encouragement might mean a lot.</p>
        <div className="hero-actions">
          <button className="primary-button"><Send size={16} /> Send a message</button>
          <button className="text-button">Remind me tonight</button>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="kicker">Your circle</p>
            <h2>People who matter today</h2>
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
            <p className="kicker">Coming up</p>
            <h2>Worth remembering</h2>
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

function AddMemory({ people, onSaved }) {
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
      <button className="primary-button wide sticky-save" onClick={() => { setText(''); setReview(false); onSaved() }}><Sparkles size={17} /> Add to Keepsake</button>
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
    </main>
  )
}

export default function App() {
  const [tab, setTab] = useState('today')
  const [people, setPeople] = useState(peopleSeed)
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = message => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  const addPerson = (name, relationship) => {
    setPeople(prev => [...prev, { id: Date.now(), name, relationship, initials: name[0].toUpperCase(), color: '#c49678', birthday: '', nextEvent: 'Nothing scheduled yet', memory: 'A new person in your circle', likes: [], dates: [], notes: [] }])
    setCreating(false)
    showToast(`${name} was added to your circle`)
  }

  let content
  if (selected) content = <PersonDetail person={selected} onBack={() => setSelected(null)} />
  else if (creating) content = <AddPerson onCancel={() => setCreating(false)} onSave={addPerson} />
  else if (tab === 'today') content = <Today onOpen={setSelected} onAdd={() => setTab('add')} />
  else if (tab === 'upcoming') content = <Upcoming />
  else if (tab === 'relationships') content = <Relationships people={people} onOpen={setSelected} onCreate={() => setCreating(true)} />
  else content = <AddMemory people={people} onSaved={() => { setTab('today'); showToast('Your Keepsake has been updated') }} />

  return (
    <div className="app-shell">
      <div className="brand-rail"><div className="brand-mark"><Heart size={18} fill="currentColor" /></div><span>Keepsake</span></div>
      <div className="app-content">{content}</div>
      {!selected && !creating && <nav className="tab-bar">{tabs.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><span className={item.id === 'add' ? 'add-tab-icon' : ''}><Icon size={21} /></span><small>{item.label}</small></button> })}</nav>}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}
