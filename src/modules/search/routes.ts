import { Router, type Request } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateRequest } from "../../middleware/validate.js";
import { ApiError } from "../../shared/http/errors.js";
import { searchQuerySchema } from "./schemas.js";
import { searchService } from "./service.js";
const actor = (request: Request) => { if (!request.auth) throw new ApiError("UNAUTHORIZED", "Sesión inválida."); return request.auth; };
export function createSearchRoutes() { const router = Router(); router.get("/search", authenticate, validateRequest({ query: searchQuerySchema }, async (request, response, { query }) => response.json(await searchService.search(query, actor(request))))); return router; }
