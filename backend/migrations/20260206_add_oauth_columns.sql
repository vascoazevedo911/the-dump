-- Migration: make password nullable and add OAuth columns for external providers

ALTER TABLE users
  ALTER COLUMN password DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS oauth_token TEXT;

CREATE INDEX IF NOT EXISTS idx_users_oauth_id ON users(oauth_id);

-- Optional: backfill oauth_id for existing users created by OAuth if you have mapping information.
-- Example:
-- UPDATE users SET oauth_provider = 'google', oauth_id = '<google-id>' WHERE email = '<user-email>';
