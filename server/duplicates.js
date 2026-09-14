import { normalizeEmail } from './validate.js'

// Pure duplicate detection for imports. Compares incoming people (from a
// contacts file, LinkedIn CSV, or Facebook export) against the owner's
// existing circle and returns merge candidates with reasons. Deliberately
// conservative: a shared first name alone is never a match. Anything
// returned here still needs the user's "Merge them?" confirmation.

const CONFIDENCE = { 'exact-name': 0.9, email: 0.95, phone: 0.9 }

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function phonesMatch(a, b) {
  const first = normalizePhone(a)
  const second = normalizePhone(b)
  if (first.length < 7 || second.length < 7) return false
  if (first === second) return true
  // Tolerate a missing country code: "+1 (415) 555-0132" vs "4155550132".
  if (first.length >= 10 && second.length >= 10) return first.slice(-10) === second.slice(-10)
  return false
}

export function matchReasons(existing, incoming) {
  const reasons = []
  const existingName = normalizeName(existing.name)
  const incomingName = normalizeName(incoming.name)
  if (existingName && existingName === incomingName) reasons.push('exact-name')

  const existingEmail = normalizeEmail(existing.email)
  const incomingEmail = normalizeEmail(incoming.email)
  if (existingEmail && incomingEmail && existingEmail === incomingEmail) reasons.push('email')

  if (existing.phone && incoming.phone && phonesMatch(existing.phone, incoming.phone)) reasons.push('phone')
  return reasons
}

export function findDuplicateCandidates(existingPeople = [], incomingPeople = []) {
  const results = []
  for (const incoming of incomingPeople) {
    const matches = []
    for (const person of existingPeople) {
      const reasons = matchReasons(person, incoming)
      if (reasons.length) {
        matches.push({
          person,
          reasons,
          confidence: Math.max(...reasons.map(reason => CONFIDENCE[reason])),
        })
      }
    }
    if (matches.length) results.push({ incoming, matches })
  }
  return results
}
