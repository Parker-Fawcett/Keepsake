import { isValidName } from './validate.js'

// Validates a review-confirmation payload before anything is written.
// Shape: { people: [{ name, relationship?, personId?, confidence? }],
//          facts: [{ person, category, value, confidence? }],
//          dates: [{ person, label, month, day, year?, recursYearly?, confidence? }] }
// where `person` is an index into the payload's own people array.

export const FACT_CATEGORIES = ['like', 'dislike', 'gift_idea', 'family', 'work', 'place', 'memory', 'follow_up', 'other']

function isConfidence(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isIntIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
}

// Validates a single important date the way the confirm payload does,
// so the manual add-date form shares the exact same rules.
export function validateDateFields(entry) {
  if (!entry || typeof entry !== 'object') return { ok: false, errors: ['Send a date with a label, month, and day.'] }
  const label = String(entry.label || '').trim()
  if (!label || label.length > 100) return { ok: false, errors: ['Give the date a label between 1 and 100 characters.'] }
  if (!isIntIn(entry.month, 1, 12) || !isIntIn(entry.day, 1, 31)) {
    return { ok: false, errors: ['Give the date a month from 1 to 12 and a day from 1 to 31.'] }
  }
  if (entry.year !== null && entry.year !== undefined && entry.year !== '' && !Number.isInteger(entry.year)) {
    return { ok: false, errors: ['The year must be a whole number or left blank.'] }
  }
  const confidence = entry.confidence ?? 1
  if (!isConfidence(confidence)) return { ok: false, errors: ['Confidence must sit between 0 and 1.'] }
  return {
    ok: true,
    date: {
      label,
      month: entry.month,
      day: entry.day,
      year: entry.year === '' || entry.year === undefined ? null : entry.year,
      recursYearly: entry.recursYearly !== false,
      confidence,
    },
  }
}

export function validateConfirmPayload(payload) {
  const errors = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['Send a confirmation object with people, facts, and dates.'] }
  }

  const rawPeople = payload.people ?? []
  const rawFacts = payload.facts ?? []
  const rawDates = payload.dates ?? []
  if (!Array.isArray(rawPeople) || !Array.isArray(rawFacts) || !Array.isArray(rawDates)) {
    return { ok: false, errors: ['People, facts, and dates must each be an array.'] }
  }

  const people = []
  rawPeople.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`Person ${index} is not an object.`)
      return
    }
    if (!isValidName(entry.name)) {
      errors.push(`Person ${index} needs a name between 1 and 200 characters.`)
      return
    }
    const confidence = entry.confidence ?? 1
    if (!isConfidence(confidence)) {
      errors.push(`Person ${index} has a confidence outside 0 to 1.`)
      return
    }
    people.push({
      name: String(entry.name).trim(),
      relationship: String(entry.relationship || 'Other').trim().slice(0, 100) || 'Other',
      personId: entry.personId ? String(entry.personId) : null,
      confidence,
    })
  })

  const personRef = (value, kind, index) => {
    if (!isIntIn(value, 0, rawPeople.length - 1)) {
      errors.push(`${kind} ${index} points at a person that is not in this confirmation.`)
      return null
    }
    return value
  }

  const facts = []
  rawFacts.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`Fact ${index} is not an object.`)
      return
    }
    const ref = personRef(entry.person, 'Fact', index)
    if (ref === null) return
    if (!FACT_CATEGORIES.includes(entry.category)) {
      errors.push(`Fact ${index} has an unknown category.`)
      return
    }
    const value = String(entry.value || '').trim()
    if (!value || value.length > 2000) {
      errors.push(`Fact ${index} needs text between 1 and 2000 characters.`)
      return
    }
    const confidence = entry.confidence ?? 1
    if (!isConfidence(confidence)) {
      errors.push(`Fact ${index} has a confidence outside 0 to 1.`)
      return
    }
    facts.push({ person: ref, category: entry.category, value, confidence })
  })

  const dates = []
  rawDates.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`Date ${index} is not an object.`)
      return
    }
    const ref = personRef(entry.person, 'Date', index)
    if (ref === null) return
    const checked = validateDateFields(entry)
    if (!checked.ok) {
      errors.push(`Date ${index}: ${checked.errors[0]}`)
      return
    }
    dates.push({ person: ref, ...checked.date })
  })

  if (errors.length) return { ok: false, errors }
  return { ok: true, people, facts, dates }
}
