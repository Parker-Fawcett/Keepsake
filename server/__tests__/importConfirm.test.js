import { describe, expect, it } from 'vitest'
import { validateImportConfirm } from '../imports.js'

const RECORDS = [
  { name: 'Maya Johnson', email: 'maya@example.com' },
  { name: 'Jake Rivera' },
]

describe('validateImportConfirm', () => {
  it('accepts a create-all plan', () => {
    const result = validateImportConfirm({
      source: 'LinkedIn',
      records: RECORDS,
      resolutions: [{ index: 0, action: 'create' }, { index: 1, action: 'create' }],
    })
    expect(result.ok).toBe(true)
    expect(result.plan).toHaveLength(2)
  })

  it('accepts merge and skip alongside create', () => {
    const result = validateImportConfirm({
      source: 'LinkedIn',
      records: RECORDS,
      resolutions: [{ index: 0, action: 'merge', personId: 'person-1' }, { index: 1, action: 'skip' }],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a merge without a personId', () => {
    const result = validateImportConfirm({
      source: 'LinkedIn',
      records: RECORDS,
      resolutions: [{ index: 0, action: 'merge' }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a resolution pointing outside the records', () => {
    const result = validateImportConfirm({
      source: 'LinkedIn',
      records: RECORDS,
      resolutions: [{ index: 7, action: 'create' }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown action', () => {
    const result = validateImportConfirm({
      source: 'LinkedIn',
      records: RECORDS,
      resolutions: [{ index: 0, action: 'vaporize' }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a created record with a bad email', () => {
    const result = validateImportConfirm({
      source: 'LinkedIn',
      records: [{ name: 'Maya', email: 'not-an-email' }],
      resolutions: [{ index: 0, action: 'create' }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a blank source and an empty resolution list', () => {
    expect(validateImportConfirm({ source: '', records: RECORDS, resolutions: [] }).ok).toBe(false)
    expect(validateImportConfirm({ source: 'LinkedIn', records: RECORDS, resolutions: [] }).ok).toBe(false)
  })
})
