import type { DatabaseClient } from "../auth/repo.js";
export interface SearchRow { type: "CASE" | "CONTACT" | "ACTION"; id: string; title: string; subtitle: string; path: string; at: Date }
export class SearchRepository {
  cases(db: DatabaseClient, term: string, identifier: string, limit: number) { const pattern = `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`; return db.$queryRaw<SearchRow[]>`
    SELECT 'CASE'::text AS type, c.id, c.title, c.case_number AS subtitle,
      '/juicios/' || c.id::text AS path, c.updated_at AS at
    FROM legal_cases c
    WHERE c.deleted_at IS NULL AND (
      translate(lower(c.title), 'áéíóúüñ', 'aeiouun') LIKE ${pattern} ESCAPE '\'
      OR (${identifier} <> '' AND c.case_number_normalized LIKE ${`%${identifier}%`})
    ) ORDER BY c.updated_at DESC LIMIT ${limit}
  `; }
  contacts(db: DatabaseClient, term: string, limit: number) { const pattern = `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`; return db.$queryRaw<SearchRow[]>`
    SELECT 'CONTACT'::text AS type, c.id, c.display_name AS title,
      CASE WHEN c.kind = 'PERSON' THEN 'Persona' ELSE 'Organización' END AS subtitle,
      '/contactos?contactId=' || c.id::text AS path, c.updated_at AS at
    FROM contacts c WHERE c.deleted_at IS NULL AND c.display_name_normalized LIKE ${pattern} ESCAPE '\'
    ORDER BY c.updated_at DESC LIMIT ${limit}
  `; }
  actions(db: DatabaseClient, term: string, limit: number) { const pattern = `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`; return db.$queryRaw<SearchRow[]>`
    SELECT 'ACTION'::text AS type, a.id, a.title, lc.case_number || ' · ' || lc.title AS subtitle,
      '/juicios/' || a.case_id::text AS path, a.document_at AS at
    FROM case_actions a JOIN legal_cases lc ON lc.id = a.case_id
    WHERE a.deleted_at IS NULL AND lc.deleted_at IS NULL
      AND translate(lower(a.title), 'áéíóúüñ', 'aeiouun') LIKE ${pattern} ESCAPE '\'
    ORDER BY a.document_at DESC LIMIT ${limit}
  `; }
}
export const searchRepository = new SearchRepository();
