import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../http/api-exception';
import { sha256Hex } from '../utils/crypto.util';
import { loadEnv } from '../config/env';
import { AuthUser, AuthenticatedRequest, IS_PUBLIC_KEY } from './auth-user';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SessionAuthGuard.name);
  private readonly env = loadEnv();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readCookie(request.headers.cookie, this.env.SESSION_COOKIE_NAME);
    if (!token) throw ApiException.unauthorized();

    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: {
        user: {
          include: { roles: { include: { role: true } } },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw ApiException.unauthorized('Your session has expired. Please sign in again.');
    }
    if (!session.user || session.user.deletedAt) {
      throw ApiException.unauthorized('This account is no longer available.');
    }
    if (session.user.suspendedAt) {
      throw new ApiException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended. Contact support if you believe this is a mistake.',
        status: 403,
      });
    }

    const user: AuthUser = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      roles: session.user.roles.map((entry) => entry.role.name),
      emailVerified: Boolean(session.user.emailVerifiedAt),
      mfaEnabled: session.user.mfaEnabled,
      sessionId: session.id,
      csrfHash: session.csrfHash,
      suspended: Boolean(session.user.suspendedAt),
    };
    request.user = user;

    // Touch once a minute at most to avoid a write on every request.
    if (Date.now() - session.lastUsedAt.getTime() > 60_000) {
      this.prisma.userSession
        .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
        .catch((error: Error) => this.logger.warn(`Failed to touch session: ${error.message}`));
    }

    return true;
  }

  private readCookie(header: string | undefined, name: string): string | null {
    if (!header) return null;
    for (const part of header.split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
  }
}
