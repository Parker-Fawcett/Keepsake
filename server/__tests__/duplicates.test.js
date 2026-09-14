import { describe, expect, it } from 'vitest'
import { findDuplicateCandidates, normalizeName, normalizePhone } from '../duplicates.js'

const MAYA = { id: 'a', name: 'Maya Johnson', email: 'maya@example.com', phone: '+1 (415) 555-0132' }

describe('normalizeName', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeName('  Maya   JOHNSON ')).toBe('maya johnson')
  })
})

describe('normalizePhone', () => {
  it('strips everything but digits', () => {
    expect(normalizePhone('+1 (415) 555-0132')).toBe('14155550132')
  })
})

describe('findDuplicateCandidates', () => {
  it('flags an exact normalized name match', () => {
    const results = findDuplicateCandidates([MAYA], [{ name: '  maya JOHNSON ' }])
    expect(results).toHaveLength(1)
    expect(results[0].matches).toHaveLength(1)
    expect(results[0].matches[0].person).toBe(MAYA)
    expect(results[0].matches[0].reasons).toContain('exact-name')
  })

  it('flags an email match even when the name differs', () => {
    const results = findDuplicateCandidates([MAYA], [{ name: 'M. Johnson', email: 'MAYA@EXAMPLE.COM' }])
    expect(results).toHaveLength(1)
    expect(results[0].matches[0].reasons).toContain('email')
    expect(results[0].matches[0].reasons).not.toContain('exact-name')
  })

  it('flags a phone match across different formats', () => {
    const results = findDuplicateCandidates([MAYA], [{ name: 'Someone Else', phone: '4155550132' }])
    expect(results).toHaveLength(1)
    expect(results[0].matches[0].reasons).toContain('phone')
  })

  it('ignores short or empty phones instead of false-matching', () => {
    expect(findDuplicateCandidates([MAYA], [{ name: 'Stranger', phone: '123' }])).toEqual([])
    expect(findDuplicateCandidates([MAYA], [{ name: 'Stranger' }])).toEqual([])
  })

  it('returns nothing when nothing overlaps', () => {
    const results = findDuplicateCandidates([MAYA], [{ name: 'Jake Rivera', email: 'jake@example.com' }])
    expect(results).toEqual([])
  })

  it('checks every incoming person and returns only those with matches', () => {
    const results = findDuplicateCandidates(
      [MAYA],
      [{ name: 'Jake Rivera' }, { name: 'Maya Johnson' }],
    )
    expect(results).toHaveLength(1)
    expect(results[0].incoming).toEqual({ name: 'Maya Johnson' })
  })

  it('combines multiple reasons and keeps the highest confidence', () => {
    const results = findDuplicateCandidates(
      [MAYA],
      [{ name: 'Maya Johnson', email: 'maya@example.com', phone: '4155550132' }],
    )
    expect(results[0].matches[0].reasons).toEqual(expect.arrayContaining(['exact-name', 'email', 'phone']))
    expect(results[0].matches[0].confidence).toBe(0.95)
  })
})
