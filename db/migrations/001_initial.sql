CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  display_name text NOT NULL DEFAULT 'Friend',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text text NOT NULL CHECK (char_length(raw_text) <= 100000),
  source text NOT NULL DEFAULT 'manual',
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'review', 'complete', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  relationship text NOT NULL DEFAULT 'Other',
  color text NOT NULL DEFAULT '#59717b',
  avatar_url text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS people_owner_name_idx ON people(owner_id, lower(name));

CREATE TABLE IF NOT EXISTS note_people (
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (note_id, person_id)
);

CREATE TABLE IF NOT EXISTS facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  source_note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  category text NOT NULL,
  value text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facts_person_idx ON facts(person_id, category);

CREATE TABLE IF NOT EXISTS important_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  source_note_id uuid REFERENCES notes(id) ON DELETE SET NULL,
  label text NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  year integer,
  recurs_yearly boolean NOT NULL DEFAULT true,
  reminder_rules jsonb NOT NULL DEFAULT '[{"daysBefore":14},{"daysBefore":3}]'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS important_dates_person_idx ON important_dates(person_id);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id uuid REFERENCES people(id) ON DELETE CASCADE,
  important_date_id uuid REFERENCES important_dates(id) ON DELETE CASCADE,
  title text NOT NULL,
  remind_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sent', 'dismissed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders(status, remind_at);

CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL,
  filename text,
  record_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'uploaded',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (id, display_name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Parker')
ON CONFLICT (id) DO NOTHING;
