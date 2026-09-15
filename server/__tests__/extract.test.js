import { describe, expect, it } from 'vitest'
import { extractRelationships } from '../extract.js'

const MAYA = { name: 'Maya', relationship: 'Partner' }

describe('extractRelationships (local mode, no API key)', () => {
  it('matches a known person with high confidence and keeps their relationship', async () => {
    const { mode, data } = await extractRelationships('Had coffee with Maya today.', [MAYA])
    expect(mode).toBe('local')
    expect(data.people).toHaveLength(1)
    expect(data.people[0]).toMatchObject({ name: 'Maya', relationship: 'Partner', confidence: 0.98 })
  })

  it('pulls a like fact from explicit wording', async () => {
    const { data } = await extractRelationships('Maya loves sunflowers.', [MAYA])
    expect(data.people[0].facts).toContainEqual({ category: 'like', value: 'sunflowers', confidence: 0.72 })
  })

  it('pulls a birthday date with month and day', async () => {
    const { data } = await extractRelationships('Her birthday is March 12.', [{ name: 'Her', relationship: 'Other' }])
    expect(data.people[0].dates).toContainEqual({
      label: 'Birthday',
      month: 3,
      day: 12,
      year: null,
      recursYearly: true,
      confidence: 0.82,
    })
  })

  it('flags an unknown name from relationship wording as low confidence, relationship unknown', async () => {
    const { data } = await extractRelationships('My friend Sarah is coming over.', [])
    expect(data.people).toHaveLength(1)
    expect(data.people[0]).toMatchObject({ name: 'Sarah', relationship: null, confidence: 0.68 })
  })

  it('returns zero people and never invents anyone for a note with no names', async () => {
    const { mode, data } = await extractRelationships('Just thinking about the weekend.', [])
    expect(mode).toBe('local')
    expect(data.people).toEqual([])
  })

  it('matching is case-insensitive for known people', async () => {
    const { data } = await extractRelationships('maya called this morning', [MAYA])
    expect(data.people).toHaveLength(1)
    expect(data.people[0].name).toBe('Maya')
  })

  it('detects a full First Last name bare in the text', async () => {
    const { data } = await extractRelationships('Jake Stidham joined CHG. I met Jake Stidham today.', [])
    const names = data.people.map(person => person.name)
    expect(names).toContain('Jake Stidham')
    expect(names).not.toContain('Jake')
    expect(names).not.toContain('Stidham')
  })

  it('detects a repeated single name at low confidence', async () => {
    const { data } = await extractRelationships('Maddie called this morning. I saw Maddie at the canyon.', [])
    expect(data.people).toHaveLength(1)
    expect(data.people[0]).toMatchObject({ name: 'Maddie', confidence: 0.55 })
  })

  it('never flags months, weekdays, pronouns, or one-off words', async () => {
    const { data } = await extractRelationships('We went to Google on Monday in March. They said it was fine.', [])
    expect(data.people).toEqual([])
  })

  it('flags ambiguous repeats at low confidence for the user to exclude', async () => {
    const { data } = await extractRelationships('Love Thai food. Had Thai takeout.', [])
    expect(data.people).toHaveLength(1)
    expect(data.people[0].confidence).toBeLessThan(0.6)
  })
})
