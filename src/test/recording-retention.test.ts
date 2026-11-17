import { describe, expect, it } from 'vitest';
import { recordingExpiresAt } from '@/lib/recording-retention';
describe('one calendar month recording retention', () => {
  it('keeps a recording for one month', () => expect(recordingExpiresAt('2026-11-17T21:35:00Z')).toBe('2026-12-17T21:35:00.000Z'));
  it('clamps the last day to a shorter month', () => expect(recordingExpiresAt('2027-01-31T10:00:00Z')).toBe('2027-02-28T10:00:00.000Z'));
});