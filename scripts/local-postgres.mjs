#!/usr/bin/env node
/**
 * Local development helper: run a real PostgreSQL 17 cluster without Docker or root.
 *
 * This exists because the project's normal path is `docker compose up`. When Docker
 * is unavailable (CI sandboxes, restricted laptops), this gives Prisma a genuine
 * PostgreSQL server so migrations and integration tests run against the real engine.
 *
 * Usage: node scripts/local-postgres.mjs [--port 5432]
 * Data lives in .local/pgdata (gitignored). Stop with SIGINT/SIGTERM.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const portArgIndex = process.argv.indexOf('--port');
const port = portArgIndex > -1 ? Number(process.argv[portArgIndex + 1]) : 5432;
const root = resolve(import.meta.dirname, '..');
const databaseDir = resolve(root, '.local/pgdata');
const pidFile = resolve(root, '.local/postgres.pid');

mkdirSync(resolve(root, '.local'), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'scamshield',
  password: 'scamshield',
  port,
  persistent: true,
  autoRehydrateSymlinks: true,
  onLog: (message) => process.stdout.write(`[postgres] ${message}\n`),
  onError: (error) => process.stderr.write(`[postgres:error] ${String(error)}\n`),
});

const shutdown = async () => {
  try {
    await pg.stop();
  } finally {
    rmSync(pidFile, { force: true });
    process.exit(0);
  }
};

try {
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('scamshield');
  } catch (error) {
    if (!String(error).toLowerCase().includes('already exists')) throw error;
  }
  writeFileSync(pidFile, String(process.pid));
  console.log(`PostgreSQL ready on 127.0.0.1:${port} (database: scamshield)`);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Keep the supervisor process alive for as long as the server should run.
  setInterval(() => {}, 1 << 30);
} catch (error) {
  console.error('Failed to start local PostgreSQL:', error);
  process.exit(1);
}
