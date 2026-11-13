import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadEnv } from './common/config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.service';
import { AuditModule } from './common/audit/audit.service';
import { MailModule } from './common/mail/mail.service';
import { CatalogModule } from './common/catalog/catalog.service';
import { SessionAuthGuard } from './common/security/session-auth.guard';
import { CsrfGuard } from './common/security/csrf.guard';
import { RolesGuard } from './common/security/roles.guard';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScansModule } from './scans/scans.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';

const env = loadEnv();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: env.THROTTLE_TTL_SECONDS * 1000,
        limit: env.THROTTLE_LIMIT,
      },
    ]),
    PrismaModule,
    RedisModule,
    AuditModule,
    MailModule,
    CatalogModule,
    AuthModule,
    NotificationsModule,
    ScansModule,
    DashboardModule,
    UsersModule,
    ReportsModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle -> authenticate -> CSRF -> authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
