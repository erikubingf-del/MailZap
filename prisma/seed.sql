-- Seed the 5 email categories
INSERT INTO "EmailCategory" (name, "displayName", description, icon) VALUES
  ('banks', 'Banks', 'Bills, expenses, and promotional offers from financial institutions', '🏦'),
  ('apps', 'Apps', 'Purchase confirmations, crypto transfers, and app notifications', '📱'),
  ('promotions', 'Promotions', 'Campaign ads, time-sensitive deals, Black Friday, flash sales', '🎯'),
  ('work', 'Work', 'Professional correspondence and work-related emails', '💼'),
  ('personal', 'Personal', 'Passport renewals, legal matters, hotel/flight confirmations, personal appointments', '✉️')
ON CONFLICT (name) DO NOTHING;
