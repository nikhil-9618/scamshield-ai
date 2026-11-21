import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it.each(['/dashboard', '/dashboard?tab=scans', '/scans/123#result'])('keeps same-origin path %s', (value) => {
    expect(safeNextPath(value)).toBe(value);
  });

  it.each([
    undefined,
    '',
    'dashboard',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    '/dashboard\nLocation: https://evil.example',
  ])('rejects unsafe destination %s', (value) => {
    expect(safeNextPath(value)).toBeNull();
  });
});
