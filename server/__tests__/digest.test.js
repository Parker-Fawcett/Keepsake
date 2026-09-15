import { describe, expect, it } from 'vitest'
import { buildWeeklyReview } from '../digest.js'

const NOW = new Date('2026-09-14T12:00:00Z')
const day = n => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString()

describe('buildWeeklyReview', () => {
  it('collects reminders due in the next 7 days, soonest first', () => {
    const review = buildWeeklyReview({
      reminders: [
        { id: 'a', title: 'Far', remind_at: day(20) },
        { id: 'b', title: 'Near', remind_at: day(2) },
        { id: 'c', title: 'Edge', remind_at: day(7) },
      ],
      notes: [],
      people: [],
      links: [],
      now: NOW,
    })
    expect(review.weekAhead.map(item => item.id)).toEqual(['b', 'c'])
  })

  it('flags unconfirmed notes with a snippet', () => {
    const review = buildWeeklyReview({
      reminders: [],
      notes: [
        { id: 'n1', raw_text: 'Maya loves sunflowers and silver jewelry from that shop', processing_status: 'review', created_at: day(-1) },
        { id: 'n2', raw_text: 'done', processing_status: 'complete', created_at: day(-1) },
      ],
      people: [],
      links: [],
      now: NOW,
    })
    expect(review.needsReview).toHaveLength(1)
    expect(review.needsReview[0].id).toBe('n1')
    expect(review.needsReview[0].snippet.length).toBeLessThanOrEqual(80)
  })

  it('names people quiet for 30 days, including the never-mentioned', () => {
    const review = buildWeeklyReview({
      reminders: [],
      notes: [],
      people: [{ id: 'p1', name: 'Maya' }, { id: 'p2', name: 'Jake' }, { id: 'p3', name: 'Mom' }],
      links: [
        { person_id: 'p1', note_created_at: day(-40) },
        { person_id: 'p2', note_created_at: day(-2) },
      ],
      now: NOW,
    })
    expect(review.quiet.map(person => person.id).sort()).toEqual(['p1', 'p3'])
  })

  it('reports counts for the week', () => {
    const review = buildWeeklyReview({ reminders: [{ id: 'a', remind_at: day(1) }], notes: [], people: [{ id: 'p1' }], links: [], now: NOW })
    expect(review.counts).toMatchObject({ due: 1, unreviewed: 0, quiet: 1 })
  })
})
