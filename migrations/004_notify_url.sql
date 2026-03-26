-- Outbound webhook URL for deploy notifications
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notify_url TEXT;
