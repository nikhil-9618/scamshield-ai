import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadEnv } from '../config/env';

const DEV_KEY_SEED = 'scamshield-ai-development-only-key-do-not-use-in-production';

function encryptionKey(): Buffer {
  const env = loadEnv();
  if (env.APP_ENCRYPTION_KEY) {
    const raw = env.APP_ENCRYPTION_KEY.trim();
    // Accept the documented 32-byte base64 value, a 64-character hex value
    // (Render's generated secrets), or any sufficiently long random string.
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length === 32) return key;
    if (raw.length >= 32) return createHash('sha256').update(raw, 'utf8').digest();
    throw new Error('APP_ENCRYPTION_KEY must be 32 bytes encoded as base64 (openssl rand -base64 32)');
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('APP_ENCRYPTION_KEY is required in production');
  }
  // Deterministic development key so local restarts can read previously written rows.
  return createHash('sha256').update(DEV_KEY_SEED).digest();
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison over hashes, safe for differently sized inputs. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url parts). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
    throw new Error('Unsupported ciphertext format');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'hidden';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 6) return 'hidden';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function sha256Json(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}
