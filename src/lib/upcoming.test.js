import { describe, expect, it } from 'vitest'
import { CakeSlice, CalendarDays, Church, Coffee, Gift, GraduationCap, Heart, Home, PawPrint, Plane, PlaneTakeoff, Snowflake, Star, Stethoscope } from 'lucide-react'
import {
  buildCalendarMonth,
  colorForName,
  dayLabelFor,
  iconForReminder,
  mapReminderToEvent,
  parseCsvRows,
  recordsFromCsv,
  reminderPalette,
} from './upcoming.js'

describe('colorForName', () => {
  it('is deterministic and stays inside the palette', () => {
    expect(colorForName('Maya')).toBe(colorForName('Maya'))
    expect(reminderPalette).toContain(colorForName('Maya'))
    expect(reminderPalette).toContain(colorForName('Someone Else Entirely'))
  })
})

describe('iconForReminder', () => {
  it('picks the cake for birthdays and the heart for anniversaries', () => {
    expect(iconForReminder('Mom · Birthday', 'Birthday')).toBe(CakeSlice)
    expect(iconForReminder('Us', 'Anniversary')).toBe(Heart)
    expect(iconForReminder('Wedding anniversary', 'Anniversary')).toBe(Heart)
  })

  it('maps the common life events to distinct icons', () => {
    expect(iconForReminder('Graduation', 'Graduation')).toBe(GraduationCap)
    expect(iconForReminder('Interview', 'Interview')).toBe(Star)
    expect(iconForReminder('Christmas', 'Holiday')).toBe(Snowflake)
    expect(iconForReminder('Moving day', 'Moving')).toBe(Home)
    expect(iconForReminder('Gift ride', 'Gift')).toBe(Gift)
    expect(iconForReminder('Got a puppy', 'Got a puppy')).toBe(PawPrint)
    expect(iconForReminder('Trip to Rome', 'Travel')).toBe(Plane)
    expect(iconForReminder('Wedding', 'Wedding')).toBe(Church)
    expect(iconForReminder('Flight home', 'Travel')).toBe(PlaneTakeoff)
    expect(iconForReminder('Coffee date', 'Date')).toBe(Coffee)
    expect(iconForReminder('Dentist', 'Appointment')).toBe(Stethoscope)
  })

  it('falls back to the calendar for anything else', () => {
    expect(iconForReminder('Random thing', 'Other')).toBe(CalendarDays)
  })
})

describe('dayLabelFor', () => {
  const now = new Date('2026-09-14T12:00:00')
  it('labels today, tomorrow, and weekdays', () => {
    expect(dayLabelFor(new Date('2026-09-14T09:00:00'), now)).toBe('TODAY')
    expect(dayLabelFor(new Date('2026-09-15T09:00:00'), now)).toBe('TOMOR')
    expect(dayLabelFor(new Date('2026-09-19T09:00:00'), now)).toBe('SAT')
  })
})

describe('mapReminderToEvent', () => {
  it('shapes a reminder into an event row', () => {
    const event = mapReminderToEvent({
      title: 'Mom · Birthday',
      remind_at: '2026-11-01T09:00:00.000Z',
      person_name: 'Mom',
      date_label: 'Birthday',
    })
    expect(event.person).toBe('Mom')
    expect(event.title).toBe('Mom · Birthday')
    expect(event.icon).toBe(CakeSlice)
    expect(reminderPalette).toContain(event.color)
  })
})

describe('parseCsvRows', () => {
  it('handles quoted commas and escaped quotes', () => {
    const rows = parseCsvRows('a,b\n"Smith, Jr.", "say ""hi"""\n')
    expect(rows).toEqual([['a', 'b'], ['Smith, Jr.', ' say "hi"']])
  })
})

describe('recordsFromCsv', () => {
  it('reads LinkedIn Connections headers', () => {
    const records = recordsFromCsv('First Name,Last Name,Email Address,Company,Position\nMaya,Johnson,maya@example.com,Acme,Designer\n')
    expect(records).toEqual([{ name: 'Maya Johnson', email: 'maya@example.com', company: 'Acme' }])
  })

  it('falls back to the first column for nameless headers and skips blank rows', () => {
    const records = recordsFromCsv('handle,url\n,http://x\njake,http://y\n')
    expect(records).toEqual([{ name: 'jake' }])
  })

  it('returns nothing for a header-only file', () => {
    expect(recordsFromCsv('First Name, Last Name\n')).toEqual([])
  })
})

describe('buildCalendarMonth', () => {
  it('starts weeks on Monday with leading blanks', () => {
    // September 2026 opens on a Tuesday: one blank, then 1..30.
    const grid = buildCalendarMonth(2026, 8)
    expect(grid.label).toBe('September 2026')
    expect(grid.cells.slice(0, 3)).toEqual([null, 1, 2])
    expect(grid.cells.filter(day => day !== null)).toHaveLength(30)
    expect(grid.cells.length % 7).toBe(0)
  })

  it('needs no blanks when the month opens on Monday', () => {
    // June 2026 opens on a Monday with 30 days.
    const grid = buildCalendarMonth(2026, 5)
    expect(grid.cells.slice(0, 3)).toEqual([1, 2, 3])
    expect(grid.cells.filter(day => day !== null)).toHaveLength(30)
  })

  it('pads the trailing week so every row is complete', () => {
    const grid = buildCalendarMonth(2026, 8)
    expect(grid.cells.slice(-1)).toEqual([null])
  })
})
