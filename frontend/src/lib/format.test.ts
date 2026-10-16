import { describe, expect, it } from 'vitest';
import { ApiError, toQuery } from '../api/client';
import { formatBytes, fromLocalInput, toLocalInput } from './format';

describe('date input conversion', () => {
  it('round-trips a datetime-local value through the ISO string sent to the API', () => {
    const iso = fromLocalInput('2030-03-01T09:30');
    expect(iso).toMatch(/Z$/);
    expect(toLocalInput(iso)).toBe('2030-03-01T09:30');
  });
  it('treats empty or invalid input as no value', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('not a date')).toBeNull();
    expect(toLocalInput(null)).toBe('');
  });
});

describe('API helpers', () => {
  it('maps validation details to field errors', () => {
    const e = new ApiError(400, 'VALIDATION_FAILED', 'bad', [
      { path: 'title', message: 'Required' },
      { path: 'scheduledEnd', message: 'must be after start' },
    ]);
    expect(e.fieldErrors).toEqual({ title: 'Required', scheduledEnd: 'must be after start' });
    expect(new ApiError(409, 'SCHEDULE_CONFLICT', 'x').fieldErrors).toEqual({});
  });
  it('builds query strings without empty values', () => {
    expect(toQuery({ q: 'pump', status: '', page: 2, x: undefined })).toBe('?q=pump&page=2');
    expect(toQuery({})).toBe('');
  });
  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
