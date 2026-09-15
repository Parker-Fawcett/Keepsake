// Weekly review digest: everything that needs attention, computed pure
// from plain rows so it is unit-testable without a database.

const DAY_MS = 24 * 60 * 60 * 1000
const QUIET_AFTER_DAYS = 30
const WEEK_DAYS = 7

export function buildWeeklyReview({ reminders = [], notes = [], people = [], links = [], now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now)

  const weekAhead = reminders
    .filter(reminder => {
      const time = new Date(reminder.remind_at).getTime()
      return time >= at.getTime() && time <= at.getTime() + WEEK_DAYS * DAY_MS
    })
    .sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at))

  const needsReview = notes
    .filter(note => note.processing_status === 'review' || note.processing_status === 'pending')
    .map(note => ({
      id: note.id,
      snippet: String(note.raw_text || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      createdAt: note.created_at,
    }))

  const latestByPerson = new Map()
  for (const link of links) {
    const time = new Date(link.note_created_at).getTime()
    if (!latestByPerson.has(link.person_id) || time > latestByPerson.get(link.person_id)) {
      latestByPerson.set(link.person_id, time)
    }
  }
  const quiet = people
    .filter(person => {
      const latest = latestByPerson.get(person.id)
      return latest === undefined || at.getTime() - latest > QUIET_AFTER_DAYS * DAY_MS
    })
    .map(person => ({ id: person.id, name: person.name }))

  return {
    weekAhead,
    needsReview,
    quiet,
    counts: { due: weekAhead.length, unreviewed: needsReview.length, quiet: quiet.length },
  }
}
