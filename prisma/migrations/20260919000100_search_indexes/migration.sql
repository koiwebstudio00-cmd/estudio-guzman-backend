CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "legal_cases_title_search_trgm_idx"
  ON "legal_cases" USING gin ((translate(lower("title"), 'áéíóúüñ', 'aeiouun')) gin_trgm_ops)
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "contacts_name_search_trgm_idx"
  ON "contacts" USING gin ("display_name_normalized" gin_trgm_ops)
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "case_actions_title_search_trgm_idx"
  ON "case_actions" USING gin ((translate(lower("title"), 'áéíóúüñ', 'aeiouun')) gin_trgm_ops)
  WHERE "deleted_at" IS NULL;
