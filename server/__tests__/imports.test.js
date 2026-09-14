import { describe, expect, it } from 'vitest'
import { buildImportReview, MAX_REVIEW_RECORDS } from '../imports.js'

const MAYA = { id: 'a', name: 'Maya Johnson' }

describe('buildImportReview', () => {
  it('splits incoming records into fresh people and merge candidates', () => {
    const review = buildImportReview([MAYA], [{ name: 'Maya Johnson' }, { name: 'Jake Rivera' }])
    expect(review.total).toBe(2)
    expect(review.candidates).toHaveLength(1)
    expect(review.candidates[0].incoming).toEqual({ name: 'Maya Johnson' })
    expect(review.candidates[0].matches[0].person).toBe(MAYA)
    expect(review.fresh).toEqual([{ name: 'Jake Rivera' }])
    expect(review.skipped).toBe(0)
  })

  it('counts records with blank names as skipped, never as people', () => {
    const review = buildImportReview([MAYA], [{ name: '   ' }, { name: 'Jake Rivera' }, {}])
    expect(review.total).toBe(3)
    expect(review.fresh).toEqual([{ name: 'Jake Rivera' }])
    expect(review.candidates).toEqual([])
    expect(review.skipped).toBe(2)
  })

  it('returns empty groups for empty input', () => {
    expect(buildImportReview([MAYA], [])).toEqual({ total: 0, candidates: [], fresh: [], skipped: 0 })
  })

  it('keeps extra import fields on the incoming record untouched', () => {
    const incoming = { name: 'Jake Rivera', email: 'jake@example.com', company: 'Acme' }
    const review = buildImportReview([MAYA], [incoming])
    expect(review.fresh[0]).toBe(incoming)
  })

  it('caps the number of reviewable records', () => {
    expect(MAX_REVIEW_RECORDS).toBe(5000)
  })
})
