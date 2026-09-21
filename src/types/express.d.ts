import type { AuthenticatedActor } from "../modules/auth/types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedActor;
    }
  }
}

export {};
