import { describe, expect, it } from 'vitest';
import { riskLevelFromScore } from '@scamshield/shared-types';
import { formatDate, relativeTime, truncate } from './utils';

describe('risk thresholds', () => {
  it('maps scores to the documented product bands', () => {
    expect(riskLevelFromScore(0)).toBe('low');
    expect(riskLevelFromScore(24)).toBe('low');
    expect(riskLevelFromScore(25)).toBe('moderate');
    expect(riskLevelFromScore(49)).toBe('moderate');
    expect(riskLevelFromScore(50)).toBe('high');
    expect(riskLevelFromScore(74)).toBe('high');
    expect(riskLevelFromScore(75)).toBe('critical');
    expect(riskLevelFromScore(100)).toBe('critical');
  });

  it('clamps out-of-range values rather than producing an undefined band', () => {
    expect(riskLevelFromScore(-10)).toBe('low');
    expect(riskLevelFromScore(999)).toBe('critical');
  });
});

describe('formatting helpers', () => {
  it('truncates long values and leaves short ones untouched', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a'.repeat(20), 10)).toHaveLength(10);
    expect(truncate('a'.repeat(20), 10).endsWith('…')).toBe(true);
  });

  it('formats dates without throwing', () => {
    expect(formatDate('2026-11-11T00:00:00.000Z')).toMatch(/2026/);
  });

  it('describes recent timestamps relatively', () => {
    expect(relativeTime(new Date())).toBe('just now');
    expect(relativeTime(new Date(Date.now() - 5 * 60_000))).toMatch(/min ago/);
  });
});
