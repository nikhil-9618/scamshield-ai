import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { loadEnv, corsOrigins, isProduction } from './common/config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn', 'log'] });

  app.getHttpAdapter().getInstance().set('trust proxy', env.TRUST_PROXY);
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });

  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      const allowed = corsOrigins(env);
      if (!origin || allowed.includes(origin)) return callback(null, true);
      // Do not throw here: a rejected origin should reach the CSRF guard and
      // produce a clean 403, not an unhandled 500 from the CORS middleware.
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '64kb' }));

  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = (request.headers['x-request-id'] as string | undefined)?.slice(0, 64) ?? randomUUID();
    (request as Request & { id: string }).id = requestId;
    response.setHeader('x-request-id', requestId);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    response.setHeader('Cache-Control', 'no-store');
    if (isProduction(env)) {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // Swagger UI needs to load its own assets; API responses are locked down.
    if (!request.path.startsWith('/api/docs')) {
      response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    }
    next();
  });

  if (env.ENABLE_API_DOCS) {
    const config = new DocumentBuilder()
      .setTitle('ScamShield AI API')
      .setDescription(
        'REST API for ScamShield AI. Session-cookie authentication; mutating requests require X-CSRF-Token. ' +
          'Risk scores are transparent heuristics, not probabilities of fraud.',
      )
      .setVersion('1.0.0')
      .addTag('auth')
      .addTag('scans')
      .addTag('reports')
      .addTag('threats')
      .addTag('users')
      .addTag('admin')
      .addTag('health')
      .addCookieAuth(env.SESSION_COOKIE_NAME, { type: 'apiKey', in: 'cookie' }, 'session')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'ScamShield AI API',
      swaggerOptions: { withCredentials: true },
    });
  }

  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`ScamShield API listening on :${env.PORT} (docs: ${env.ENABLE_API_DOCS ? '/api/docs' : 'disabled'})`);
}

bootstrap().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('API failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
