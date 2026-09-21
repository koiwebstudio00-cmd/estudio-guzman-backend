export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: {
    id: string;
    code: string;
    name: string;
  };
  permissions: string[];
}

export interface AuthenticatedActor {
  sessionId: string;
  csrfSecretHash: string;
  user: AuthenticatedUser;
}

export interface RequestContext {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}
