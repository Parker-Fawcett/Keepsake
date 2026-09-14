import { findDuplicateCandidates } from './duplicates.js'
import { isValidName, isValidOptionalEmail, isValidOptionalPhone, isValidImportSource, normalizeEmail } from './validate.js'

// Builds a no-write preview of an import: which incoming records look like
// new people, which look like duplicates needing the user's "Merge them?"
// confirmation, and how many rows were unusable. Pure function, no DB.

export const MAX_REVIEW_RECORDS = 5000

export function buildImportReview(existingPeople = [], incomingRecords = []) {
  const fresh = []
  const matchable = []
  let skipped = 0

  for (const record of incomingRecords) {
    if (!record || !isValidName(record.name)) {
      skipped += 1
      continue
    }
    matchable.push(record)
  }

  const matchedIncoming = new Set()
  const candidates = findDuplicateCandidates(existingPeople, matchable)
  for (const candidate of candidates) matchedIncoming.add(candidate.incoming)

  for (const record of matchable) {
    if (!matchedIncoming.has(record)) fresh.push(record)
  }

  return { total: incomingRecords.length, candidates, fresh, skipped }
}

// Validates an import-confirmation payload: which reviewed records to
// create as new cards, which to merge into an existing person, and which
// to skip. Returns a normalized plan or a list of errors. Pure, no DB.
export function validateImportConfirm(payload) {
  const errors = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['Send a confirmation with source, records, and resolutions.'] }
  }
  const { source, records, resolutions } = payload
  if (!isValidImportSource(source)) errors.push('Enter a valid import source.')
  if (!Array.isArray(records) || records.length < 1 || records.length > MAX_REVIEW_RECORDS) {
    errors.push(`Send between 1 and ${MAX_REVIEW_RECORDS} records to confirm.`)
  }
  if (!Array.isArray(resolutions) || resolutions.length < 1) errors.push('Send at least one resolution.')

  const plan = []
  if (!errors.length) {
    resolutions.forEach((resolution, position) => {
      if (!resolution || typeof resolution !== 'object') {
        errors.push(`Resolution ${position} is not an object.`)
        return
      }
      const { index, action, personId } = resolution
      if (!Number.isInteger(index) || index < 0 || index >= records.length) {
        errors.push(`Resolution ${position} points at a record that is not in this import.`)
        return
      }
      if (action !== 'create' && action !== 'merge' && action !== 'skip') {
        errors.push(`Resolution ${position} has an unknown action.`)
        return
      }
      const record = records[index] || {}
      if (action === 'skip') {
        plan.push({ index, action, record })
        return
      }
      if (!isValidName(record.name)) {
        errors.push(`Record ${index} needs a name between 1 and 200 characters.`)
        return
      }
      if (!isValidOptionalEmail(record.email)) {
        errors.push(`Record ${index} has an email that is not valid.`)
        return
      }
      if (!isValidOptionalPhone(record.phone)) {
        errors.push(`Record ${index} has a phone number that is not valid.`)
        return
      }
      if (action === 'merge' && !personId) {
        errors.push(`Resolution ${position} merges without saying into whom.`)
        return
      }
      plan.push({
        index,
        action,
        personId: action === 'merge' ? String(personId) : null,
        name: String(record.name).trim(),
        email: String(record.email || '').trim() ? normalizeEmail(record.email) : null,
        phone: String(record.phone || '').trim() ? String(record.phone).trim().slice(0, 40) : null,
      })
    })
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, plan }
}
