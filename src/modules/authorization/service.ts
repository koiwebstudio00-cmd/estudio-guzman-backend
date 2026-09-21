import { ApiError } from "../../shared/http/errors.js";
import type { AuthenticatedActor } from "../auth/types.js";

export class AuthorizationService {
  hasPermission(actor: AuthenticatedActor, permission: string): boolean {
    return actor.user.permissions.includes(permission);
  }

  requirePermission(actor: AuthenticatedActor, permission: string): void {
    if (!this.hasPermission(actor, permission)) {
      throw new ApiError("FORBIDDEN", "No tenés permiso para realizar esta acción.");
    }
  }
}

export const authorizationService = new AuthorizationService();
