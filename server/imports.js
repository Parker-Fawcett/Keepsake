import { findDuplicateCandidates } from './duplicates.js'
import { isValidName } from './validate.js'

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
