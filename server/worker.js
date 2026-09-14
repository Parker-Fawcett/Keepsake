// Due-reminder worker. Runs once per invocation (cron-friendly):
//   npm run worker
// Finds scheduled reminders whose time has come, sends each through the
// notifier, marks it sent, reschedules the next occurrence for recurring
// dates, and clears expired sessions. Exits non-zero on failure.
import { sql } from './db.js'
import { sendNotification } from './notify.js'
import { buildRemindersForDate, DEFAULT_REMINDER_RULES, nextOccurrence } from './reminders.js'

const BATCH_LIMIT = 100

async function deliverDueReminders() {
  const due = await sql`
    SELECT reminders.id, reminders.owner_id, reminders.person_id, reminders.important_date_id,
           reminders.title, reminders.remind_at,
           people.name AS person_name,
           important_dates.label AS date_label, important_dates.month, important_dates.day,
           important_dates.year, important_dates.recurs_yearly
    FROM reminders
    LEFT JOIN people ON people.id = reminders.person_id
    LEFT JOIN important_dates ON important_dates.id = reminders.important_date_id
    WHERE reminders.status = 'scheduled' AND reminders.remind_at <= now()
    ORDER BY reminders.remind_at
    LIMIT ${BATCH_LIMIT}
  `

  let delivered = 0
  for (const reminder of due) {
    const tokens = await sql`SELECT token FROM device_tokens WHERE user_id = ${reminder.owner_id}`
    try {
      const result = await sendNotification({
        title: reminder.title,
        body: reminder.date_label ? `${reminder.date_label} for ${reminder.person_name || 'someone'}` : reminder.title,
        tokens: tokens.map(row => row.token),
      })
      if (result.expiredTokens?.length) {
        await sql`DELETE FROM device_tokens WHERE user_id = ${reminder.owner_id} AND token = ANY(${result.expiredTokens})`
      }
    } catch (error) {
      if (error.expiredTokens?.length) {
        await sql`DELETE FROM device_tokens WHERE user_id = ${reminder.owner_id} AND token = ANY(${error.expiredTokens})`
      }
      console.error(`[worker] delivery failed for reminder ${reminder.id}:`, error.message)
      continue
    }
    await sql`UPDATE reminders SET status = 'sent' WHERE id = ${reminder.id}`
    delivered += 1

    // Recurring dates earn their next occurrence; one-time dates end here.
    if (reminder.month && reminder.day && reminder.recurs_yearly) {
      const next = nextOccurrence(
        { month: reminder.month, day: reminder.day, year: reminder.year, recursYearly: true },
        new Date(reminder.remind_at).getTime() + 1,
      )
      if (next) {
        const upcoming = buildRemindersForDate(
          {
            personName: reminder.person_name || 'Someone',
            label: reminder.date_label || 'Reminder',
            month: next.getUTCMonth() + 1,
            day: next.getUTCDate(),
            year: next.getUTCFullYear(),
            recursYearly: true,
          },
          DEFAULT_REMINDER_RULES,
          new Date(),
        )
        for (const item of upcoming) {
          await sql`
            INSERT INTO reminders (owner_id, person_id, important_date_id, title, remind_at)
            VALUES (${reminder.owner_id}, ${reminder.person_id}, ${reminder.important_date_id}, ${item.title}, ${item.remindAt.toISOString()})
            ON CONFLICT DO NOTHING
          `
        }
      }
    }
  }

  const expired = await sql`DELETE FROM sessions WHERE expires_at <= now() RETURNING id`
  return { delivered, sessionsCleared: expired.length }
}

import { fileURLToPath } from 'node:url'

export { deliverDueReminders }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  deliverDueReminders()
    .then(({ delivered, sessionsCleared }) => {
      console.log(`[worker] delivered ${delivered} reminder${delivered === 1 ? '' : 's'}, cleared ${sessionsCleared} expired session${sessionsCleared === 1 ? '' : 's'}.`)
    })
    .catch(error => {
      console.error('[worker] failed:', error.message)
      process.exitCode = 1
    })
}
