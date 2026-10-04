import type { Request } from 'express';
export interface AuthenticatedUser {
  id: string;
  role: string;
}
export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}
export interface AuthContext {
  req: AuthRequest;
}
