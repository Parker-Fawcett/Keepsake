ALTER TABLE people ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS people_owner_email_idx
  ON people(owner_id, lower(email)) WHERE email IS NOT NULL;
