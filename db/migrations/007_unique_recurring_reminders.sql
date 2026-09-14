-- A yearly date has two reminder rules. Whichever reminder fires first may
-- schedule both rules for next year, so make those inserts idempotent.
DELETE FROM reminders newer
USING reminders older
WHERE newer.important_date_id = older.important_date_id
  AND newer.remind_at = older.remind_at
  AND newer.id > older.id;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_date_time_unique_idx
  ON reminders(important_date_id, remind_at)
  WHERE important_date_id IS NOT NULL;
