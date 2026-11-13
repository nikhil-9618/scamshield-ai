import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../http/api-exception';
import { sha256Hex } from '../utils/crypto.util';
import { loadEnv } from '../config/env';
import { AuthenticatedRequest } from './auth-user';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defence in depth for state-changing requests:
 * 1. same-origin check when the browser supplies an Origin;
 * 2. double-submit CSRF token bound to the current session.
 * Public authentication endpoints cannot complete a session-bound CSRF check
 * and are covered by the origin check plus strict rate limiting.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly env = loadEnv();
  private readonly allowedOrigins = new Set(
    this.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean).concat(this.env.APP_ORIGIN),
  );

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!MUTATING_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin && !this.allowedOrigins.has(origin)) {
      throw ApiException.forbidden('Cross-origin request blocked', 'CSRF_FAILED');
    }

    const user = request.user;
    if (!user) return true;

    const headerValue = request.headers['x-csrf-token'];
    const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!token || !user.csrfHash) {
      throw ApiException.forbidden('Missing CSRF token. Refresh the page and try again.', 'CSRF_FAILED');
    }
    if (sha256Hex(token) !== user.csrfHash) {
      throw ApiException.forbidden('Invalid CSRF token. Refresh the page and try again.', 'CSRF_FAILED');
    }
    return true;
  }
}

export function getRequestCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
