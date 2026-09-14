ALTER TABLE device_tokens DROP CONSTRAINT IF EXISTS device_tokens_token_check;
ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_token_check CHECK (char_length(token) BETWEEN 1 AND 4096);
