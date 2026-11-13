import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  emailVerified: boolean;
  mfaEnabled: boolean;
  sessionId: string;
  csrfHash: string;
  suspended: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  requestId?: string;
}

export const IS_PUBLIC_KEY = 'scamshield:isPublic';
export const ROLES_KEY = 'scamshield:roles';

/** Marks a route as reachable without a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires at least one of the given roles (checked server-side, never in the client). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) {
    throw new Error('CurrentUser used on an unauthenticated route');
  }
  return request.user;
});

export function hasRole(user: Pick<AuthUser, 'roles'>, roles: string[]): boolean {
  return roles.some((role) => user.roles.includes(role));
}
