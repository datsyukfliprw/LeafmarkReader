ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS support_level TEXT NOT NULL DEFAULT 'independent_recall';
