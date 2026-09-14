import { describe, expect, it } from 'vitest'
import { buildRemindersForDate, DEFAULT_REMINDER_RULES } from '../reminders.js'

const NOV_BIRTHDAY = { personName: 'Mom', label: 'Birthday', month: 11, day: 4, year: null, recursYearly: true }

describe('buildRemindersForDate', () => {
  it('schedules default rules ahead of this year’s upcoming date', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const reminders = buildRemindersForDate(NOV_BIRTHDAY, DEFAULT_REMINDER_RULES, now)
    expect(reminders).toHaveLength(2)
    expect(reminders[0]).toMatchObject({ title: 'Mom · Birthday', remindAt: new Date('2026-10-21T09:00:00Z') })
    expect(reminders[1]).toMatchObject({ title: 'Mom · Birthday', remindAt: new Date('2026-11-01T09:00:00Z') })
  })

  it('rolls a passed recurring date to next year', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const reminders = buildRemindersForDate(
      { personName: 'Maya', label: 'Birthday', month: 3, day: 12, year: null, recursYearly: true },
      [{ daysBefore: 3 }],
      now,
    )
    expect(reminders).toHaveLength(1)
    expect(reminders[0].remindAt).toEqual(new Date('2027-03-09T09:00:00Z'))
  })

  it('returns nothing for a one-time date already in the past', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const reminders = buildRemindersForDate(
      { personName: 'Jake', label: 'Graduation', month: 5, day: 1, year: 2025, recursYearly: false },
      DEFAULT_REMINDER_RULES,
      now,
    )
    expect(reminders).toEqual([])
  })

  it('schedules a future one-time date once', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const reminders = buildRemindersForDate(
      { personName: 'Jake', label: 'Moving day', month: 9, day: 19, year: 2026, recursYearly: false },
      [{ daysBefore: 3 }],
      now,
    )
    expect(reminders).toHaveLength(1)
    expect(reminders[0].remindAt).toEqual(new Date('2026-09-16T09:00:00Z'))
  })

  it('clamps Feb 29 to Feb 28 in non-leap years', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const reminders = buildRemindersForDate(
      { personName: 'Lea', label: 'Birthday', month: 2, day: 29, year: null, recursYearly: true },
      [{ daysBefore: 0 }],
      now,
    )
    expect(reminders).toHaveLength(1)
    expect(reminders[0].remindAt).toEqual(new Date('2027-02-28T09:00:00Z'))
  })

  it('ignores malformed rules instead of failing', () => {
    const now = new Date('2026-09-14T12:00:00Z')
    const reminders = buildRemindersForDate(NOV_BIRTHDAY, [{ daysBefore: 'soon' }, null, { daysBefore: -2 }], now)
    expect(reminders).toEqual([])
  })

  it('drops reminders that would already be in the past', () => {
    const now = new Date('2026-10-25T12:00:00Z')
    const reminders = buildRemindersForDate(NOV_BIRTHDAY, DEFAULT_REMINDER_RULES, now)
    expect(reminders).toHaveLength(1)
    expect(reminders[0].remindAt).toEqual(new Date('2026-11-01T09:00:00Z'))
  })
})
