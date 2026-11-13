/**
 * Export the OpenAPI document from the compiled Nest application.
 *
 * Usage: npm run build -w @scamshield/api && npm run openapi:export -w @scamshield/api
 *
 * Uses the compiled `dist` output so the script behaves identically to the
 * running server and does not depend on a TypeScript loader.
 */
import 'reflect-metadata';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { AppModule } = require('../dist/app.module.js');
const { loadEnv } = require('../dist/common/config/env.js');

async function main() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('ScamShield AI API')
    .setDescription(
      'Session-cookie authenticated REST API for ScamShield AI. Mutating requests require X-CSRF-Token. ' +
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
  const target = path.resolve(fileURLToPath(new URL('../../../docs/openapi.json', import.meta.url)));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  const pathCount = Object.keys(document.paths ?? {}).length;
  console.log(`OpenAPI document written to ${target} (${pathCount} paths)`);
  await app.close();
}

main().catch((error) => {
  console.error('OpenAPI export failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
