import { Baby, Briefcase, CakeSlice, CalendarDays, Church, Coffee, Gift, GraduationCap, Heart, Home, MapPin, Music, Palmtree, PartyPopper, PawPrint, Phone, Plane, PlaneTakeoff, Snowflake, Sparkles, Star, Stethoscope, Sun, Trophy, Wine } from 'lucide-react'

// Pure helpers that shape scheduled reminders into event rows and parse
// contact CSVs. Tested in node; no DOM needed.

export const reminderPalette = ['#d98e78', '#8ea1b6', '#b291a4', '#86a798']

export function colorForName(name) {
  let hash = 0
  for (const char of String(name || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return reminderPalette[hash % reminderPalette.length]
}

// First match wins; more specific phrases come before generic ones so a
// "wedding anniversary" reads as a heart, not a church.
const iconRules = [
  [/birthday/, CakeSlice],
  [/annivers/, Heart],
  [/valentine|proposal|engagement/, Heart],
  [/graduat/, GraduationCap],
  [/wedding/, Church],
  [/interview/, Star],
  [/new year/, Sparkles],
  [/christmas/, Snowflake],
  [/holiday|festival/, PartyPopper],
  [/easter|spring/, Sun],
  [/flight|airport|takeoff/, PlaneTakeoff],
  [/vacation|vacay|travel|trip to/, Plane],
  [/trip/, Palmtree],
  [/move|moving|new home|house/, Home],
  [/gift/, Gift],
  [/baby|due date/, Baby],
  [/dog|puppy|pet|kitten|\bcat\b/, PawPrint],
  [/dinner|lunch|breakfast|brunch|restaurant|coffee/, Coffee],
  [/wine|beer|drinks/, Wine],
  [/concert|show|gig/, Music],
  [/race|marathon|workout|gym|football|game|match/, Trophy],
  [/dr(s\.)? appointment|checkup|dentist|doctor/, Stethoscope],
  [/work|job|promotion/, Briefcase],
  [/phone|call|catch.?up/, Phone],
  [/meet|outing|walk/, MapPin],
  [/^us$|together|dating|married|met/, Heart],
  [/school|class|semester|exam/, GraduationCap],
]

export function iconForReminder(title, dateLabel) {
  const text = `${title || ''} ${dateLabel || ''}`.toLowerCase()
  for (const [pattern, Icon] of iconRules) if (pattern.test(text)) return Icon
  return CalendarDays
}

export function dayLabelFor(date, now = new Date()) {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfDate = new Date(date)
  startOfDate.setHours(0, 0, 0, 0)
  const diffDays = Math.round((startOfDate - startOfToday) / (24 * 60 * 60 * 1000))
  if (diffDays <= 0) return 'TODAY'
  if (diffDays === 1) return 'TOMOR'
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][startOfDate.getDay()]
}

const monthLabels = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Monday-first calendar grid for a month. Cells are day numbers with null
// for padding so every rendered row is complete.
export function buildCalendarMonth(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7
  const cells = [...Array(leading).fill(null)]
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return { label: `${monthLabels[monthIndex]} ${year}`, cells }
}

export function mapReminderToEvent(reminder) {  const at = new Date(reminder.remind_at)
  const person = reminder.person_name || 'Someone'
  return {
    day: dayLabelFor(at),
    date: String(at.getDate()).padStart(2, '0'),
    remindAt: reminder.remind_at,
    person,
    title: reminder.title,
    meta: `${reminder.date_label || 'Reminder'} · ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    color: colorForName(person),
    icon: iconForReminder(reminder.title, reminder.date_label),
  }
}

export function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else inQuotes = false
      } else field += char
    } else if (char === '"') inQuotes = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter(cells => cells.some(cell => cell.trim() !== ''))
}

export function recordsFromCsv(text) {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return []
  const header = rows[0].map(cell => cell.trim().toLowerCase())
  const col = (...keys) => header.findIndex(cell => keys.some(key => cell.includes(key)))
  const firstName = col('first name')
  const lastName = col('last name')
  const fullName = firstName < 0 && lastName < 0 ? col('name') : -1
  const email = col('email')
  const phone = col('phone', 'mobile')
  const company = col('company', 'organization')
  return rows.slice(1).map(cells => {
    const get = index => (index >= 0 ? (cells[index] || '').trim() : '')
    let name = ''
    if (firstName >= 0 || lastName >= 0) name = `${get(firstName)} ${get(lastName)}`.trim()
    else if (fullName >= 0) name = get(fullName)
    else name = get(0)
    if (!name) return null
    const record = { name }
    if (get(email)) record.email = get(email)
    if (get(phone)) record.phone = get(phone)
    if (get(company)) record.company = get(company)
    return record
  }).filter(Boolean).slice(0, 5000)
}
