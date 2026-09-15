CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'MCP access',
  token_hash text NOT NULL UNIQUE,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
