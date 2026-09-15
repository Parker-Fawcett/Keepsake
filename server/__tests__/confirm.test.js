import { describe, expect, it } from 'vitest'
import { validateConfirmPayload, validateDateFields } from '../confirm.js'

const VALID = {
  people: [{ name: 'Maya', relationship: 'Friend', confidence: 0.9 }],
  facts: [{ person: 0, category: 'like', value: 'sunflowers', confidence: 0.72 }],
  dates: [{ person: 0, label: 'Birthday', month: 3, day: 12, year: null, recursYearly: true, confidence: 0.82 }],
}

describe('validateConfirmPayload', () => {
  it('accepts a well-formed review confirmation', () => {
    const result = validateConfirmPayload(VALID)
    expect(result.ok).toBe(true)
    expect(result.people).toHaveLength(1)
    expect(result.facts).toHaveLength(1)
    expect(result.dates).toHaveLength(1)
  })

  it('accepts empty groups (note with nothing worth keeping)', () => {
    expect(validateConfirmPayload({ people: [], facts: [], dates: [] }).ok).toBe(true)
  })

  it('rejects a fact pointing at a person index that does not exist', () => {
    const result = validateConfirmPayload({ ...VALID, facts: [{ person: 3, category: 'like', value: 'x' }] })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/person/i)
  })

  it('rejects a fact with an unknown category', () => {
    const result = validateConfirmPayload({ ...VALID, facts: [{ person: 0, category: 'horoscope', value: 'x' }] })
    expect(result.ok).toBe(false)
  })

  it('rejects a date with an impossible month or day', () => {
    expect(validateConfirmPayload({ ...VALID, dates: [{ ...VALID.dates[0], month: 13 }] }).ok).toBe(false)
    expect(validateConfirmPayload({ ...VALID, dates: [{ ...VALID.dates[0], day: 0 }] }).ok).toBe(false)
  })

  it('rejects a person with a blank name', () => {
    const result = validateConfirmPayload({ ...VALID, people: [{ name: '   ' }] })
    expect(result.ok).toBe(false)
  })

  it('rejects confidences outside 0 to 1', () => {
    const result = validateConfirmPayload({ ...VALID, people: [{ name: 'Maya', confidence: 1.5 }] })
    expect(result.ok).toBe(false)
  })

  it('rejects a non-object payload', () => {
    expect(validateConfirmPayload(null).ok).toBe(false)
    expect(validateConfirmPayload('note').ok).toBe(false)
  })
})

describe('validateDateFields', () => {
  it('normalizes a complete date', () => {
    expect(validateDateFields({ label: ' Birthday ', month: 3, day: 12, year: 2020, recursYearly: false })).toEqual({
      ok: true,
      date: { label: 'Birthday', month: 3, day: 12, year: 2020, recursYearly: false, confidence: 1 },
    })
  })

  it('rejects bad months, days, labels, and years', () => {
    expect(validateDateFields({ label: 'X', month: 13, day: 1 }).ok).toBe(false)
    expect(validateDateFields({ label: 'X', month: 1, day: 32 }).ok).toBe(false)
    expect(validateDateFields({ label: '  ', month: 1, day: 1 }).ok).toBe(false)
    expect(validateDateFields({ label: 'X', month: 1, day: 1, year: 20.5 }).ok).toBe(false)
  })
})
