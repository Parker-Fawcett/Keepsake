CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL CHECK (char_length(token) BETWEEN 1 AND 512),
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
