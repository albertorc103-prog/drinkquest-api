export interface RequestUserContext {
  sub?: string;
  role?: string;
}

export interface RequestContext {
  requestId?: string;
  user?: RequestUserContext;
}

