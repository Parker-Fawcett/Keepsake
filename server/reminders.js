// Pure reminder scheduling. Given an important date and a set of
// { daysBefore } rules, returns the future reminder times for the next
// occurrence. All times are 09:00 UTC on the target day. Nothing here
// touches the database.

export const DEFAULT_REMINDER_RULES = [{ daysBefore: 14 }, { daysBefore: 3 }]
export const REMINDER_HOUR_UTC = 9
const DAY_MS = 24 * 60 * 60 * 1000

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function occurrenceAt(year, month, day) {
  // Clamp impossible days (Feb 29 in non-leap years becomes Feb 28).
  const clampedDay = Math.min(day, daysInMonth(year, month))
  return new Date(Date.UTC(year, month - 1, clampedDay, REMINDER_HOUR_UTC, 0, 0))
}

export function nextOccurrence({ month, day, year, recursYearly }, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now)
  if (!recursYearly && Number.isInteger(year)) {
    const once = occurrenceAt(year, month, day)
    return once.getTime() >= at.getTime() ? once : null
  }
  let candidateYear = at.getUTCFullYear()
  let occurrence = occurrenceAt(candidateYear, month, day)
  if (occurrence.getTime() < at.getTime()) {
    candidateYear += 1
    occurrence = occurrenceAt(candidateYear, month, day)
  }
  return occurrence
}

function validRules(rules) {
  if (!Array.isArray(rules)) return []
  return rules.filter(
    rule => rule && Number.isInteger(rule.daysBefore) && rule.daysBefore >= 0 && rule.daysBefore <= 365,
  )
}

export function buildRemindersForDate(date, rules = DEFAULT_REMINDER_RULES, now = new Date()) {
  const at = now instanceof Date ? now : new Date(now)
  const occurrence = nextOccurrence(date, at)
  if (!occurrence) return []

  const seen = new Set()
  const reminders = []
  for (const rule of validRules(rules)) {
    const remindAt = new Date(occurrence.getTime() - rule.daysBefore * DAY_MS)
    if (remindAt.getTime() < at.getTime() || seen.has(remindAt.getTime())) continue
    seen.add(remindAt.getTime())
    reminders.push({ title: `${date.personName} · ${date.label}`, remindAt })
  }
  // A date inside the reminder window has no ahead-of-time slot left. Fall
  // back to the day itself so the event still shows in upcoming and the
  // yearly reschedule can chain from it. Malformed rules never produce a
  // reminder.
  if (reminders.length === 0 && validRules(rules).length > 0) {
    reminders.push({ title: `${date.personName} · ${date.label}`, remindAt: occurrence })
  }
  reminders.sort((a, b) => a.remindAt - b.remindAt)
  return reminders
}

// The upcoming feed should never go blank for a date whose reminder slots
// (14d / 3d before) have already passed. buildRemindersForDate falls back
// to the occurrence day itself so the event stays visible up to its day.
