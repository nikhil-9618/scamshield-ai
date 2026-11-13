import 'server-only';
import { cookies } from 'next/headers';
import type { ApiErrorBody } from '@scamshield/shared-types';

function normalizeApiBase(value: string | undefined): string {
  const raw = (value?.trim() || 'http://127.0.0.1:4000').replace(/\/+$/, '');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  // Render exposes a bare hostname; public services are HTTPS, private host:port is HTTP.
  return /\.onrender\.com(?::\d+)?$/i.test(raw) ? `https://${raw}` : `http://${raw}`;
}

export const API_BASE = normalizeApiBase(process.env.API_INTERNAL_URL);

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiErrorBody; status: number };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  json?: unknown;
  formData?: FormData;
  /** Server actions may persist Set-Cookie responses; server components must not. */
  persistCookies?: boolean;
  timeoutMs?: number;
}

function parseSetCookie(raw: string): { name: string; value: string; maxAge?: number; expires?: Date; httpOnly?: boolean; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none'; path?: string; domain?: string } | null {
  const [pair, ...attributes] = raw.split(';');
  if (!pair) return null;
  const separator = pair.indexOf('=');
  if (separator <= 0) return null;
  const name = pair.slice(0, separator).trim();
  const value = decodeURIComponent(pair.slice(separator + 1));
  const result: ReturnType<typeof parseSetCookie> = { name, value, path: '/' };
  if (!result) return null;
  for (const attribute of attributes) {
    const [key, ...rest] = attribute.trim().split('=');
    const attrValue = rest.join('=');
    switch (key?.toLowerCase()) {
      case 'max-age':
        result.maxAge = Number(attrValue);
        break;
      case 'expires':
        result.expires = new Date(attrValue);
        break;
      case 'httponly':
        result.httpOnly = true;
        break;
      case 'secure':
        result.secure = true;
        break;
      case 'samesite':
        result.sameSite = attrValue.toLowerCase() as 'lax' | 'strict' | 'none';
        break;
      case 'path':
        result.path = attrValue;
        break;
      case 'domain':
        result.domain = attrValue;
        break;
    }
  }
  return result;
}

/**
 * Single server-side entry point to the NestJS API. The browser never talks to
 * the API directly and never holds a session token in JavaScript-accessible
 * storage: cookies stay HttpOnly and are forwarded by this function.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join('; ');
  const csrf = cookieStore.get('ss_csrf')?.value;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (cookieHeader) headers.cookie = cookieHeader;
  if (csrf) headers['x-csrf-token'] = csrf;

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? 90_000),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: {
        statusCode: 503,
        error: 'DEPENDENCY_UNAVAILABLE',
        message:
          'The ScamShield API could not be reached. Check that the API service is running, then try again.',
      },
    };
  }

  if (options.persistCookies) {
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const parsed = parseSetCookie(raw);
      if (!parsed) continue;
      const { name, value, ...rest } = parsed;
      if (rest.expires && rest.expires.getTime() <= Date.now()) {
        cookieStore.delete(name);
      } else {
        cookieStore.set(name, value, { ...rest });
      }
    }
  }

  if (response.status === 204) {
    return { ok: true, data: undefined as T, status: 204 };
  }

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'message' in payload
        ? (payload as ApiErrorBody)
        : {
            statusCode: response.status,
            error: `HTTP_${response.status}`,
            message: 'The request could not be completed. Please try again.',
          };
    return { ok: false, status: response.status, error };
  }

  return { ok: true, data: payload as T, status: response.status };
}

export function isUnauthorized(result: ApiResult<unknown>): boolean {
  return !result.ok && (result.status === 401 || result.error.error === 'UNAUTHENTICATED');
}
