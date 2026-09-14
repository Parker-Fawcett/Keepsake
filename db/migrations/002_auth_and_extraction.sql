ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt text;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash, expires_at);

ALTER TABLE notes ADD COLUMN IF NOT EXISTS extraction jsonb;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS processing_error text;

CREATE UNIQUE INDEX IF NOT EXISTS note_people_unique_idx ON note_people(note_id, person_id);
