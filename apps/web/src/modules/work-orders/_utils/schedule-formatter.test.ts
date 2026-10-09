import { describe, expect, it } from 'vitest';
import { formatScheduleWindow } from './schedule-formatter';

describe('formatScheduleWindow', () => {
  it('returns null if either date is missing or invalid', () => {
    expect(formatScheduleWindow(null, null)).toBeNull();
    expect(formatScheduleWindow('2026-10-08T10:00:00Z', null)).toBeNull();
    expect(formatScheduleWindow('invalid', 'invalid')).toBeNull();
  });

  it('formats same-day schedule clearly with date and start-end times', () => {
    const start = '2026-10-08T10:00:00Z';
    const end = '2026-10-08T16:00:00Z';

    const result = formatScheduleWindow(start, end);
    expect(result).not.toBeNull();
    expect(result?.isSameDay).toBe(true);
    expect(result?.secondary).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)?\s?–\s?\d{1,2}:\d{2}\s?(AM|PM)?/i);
  });

  it('formats multi-day schedule explicitly displaying both start and end days', () => {
    const start = '2026-10-08T10:00:00Z';
    const end = '2026-10-09T16:00:00Z';

    const result = formatScheduleWindow(start, end);
    expect(result).not.toBeNull();
    expect(result?.isSameDay).toBe(false);
    expect(result?.secondary).toMatch(/^to\s.+/i);
    expect(result?.fullText).toContain('–');
  });
});
