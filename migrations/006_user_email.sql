-- Orqy accounts are username-based, and existing deployments have usernames
-- that are not addresses. Email is therefore optional: it is only needed to
-- raise a support ticket, which the ticket API attributes to a real reporter
-- address. Users without one can still log in and use everything else.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
