import { getPrisma } from "../../database/prisma.js";
import { normalizeIdentifier, normalizeSearch } from "../../shared/validation/normalize.js";
import type { AuthenticatedActor } from "../auth/types.js";
import { searchRepository, type SearchRow } from "./repo.js";
type SearchType = SearchRow["type"];
const permission: Record<SearchType, string> = { CASE: "cases.read", CONTACT: "contacts.read", ACTION: "actions.read" };
export class SearchService {
  async search(input: { q: string; types?: SearchType[] | undefined; limit: number }, actor: AuthenticatedActor) {
    const term = normalizeSearch(input.q); if (term.length < 2) return { data: [], meta: { limit: input.limit } };
    const requested = input.types ?? (["CASE", "CONTACT", "ACTION"] as SearchType[]);
    const allowed = requested.filter((type) => actor.user.permissions.includes(permission[type])); const db = getPrisma();
    const groups = await Promise.all(allowed.map((type) => type === "CASE" ? searchRepository.cases(db, term, normalizeIdentifier(input.q), input.limit) : type === "CONTACT" ? searchRepository.contacts(db, term, input.limit) : searchRepository.actions(db, term, input.limit)));
    const data = groups.flat().sort((first, second) => second.at.getTime() - first.at.getTime()).slice(0, input.limit);
    return { data, meta: { limit: input.limit } };
  }
}
export const searchService = new SearchService();
