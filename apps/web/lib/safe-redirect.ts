/**
 * Return a safe same-origin path for post-login navigation.
 *
 * A leading slash alone is not enough: `//evil.example` and `/\evil.example`
 * are treated as external destinations by browsers. Resolve against a dummy
 * origin and keep only paths that stay on it.
 */
export function safeNextPath(value: string | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const base = new URL('https://scamshield.invalid');
    const target = new URL(value, base);
    if (target.origin !== base.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
