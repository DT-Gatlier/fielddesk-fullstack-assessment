import { describe, expect, it } from 'vitest';
import { progressEventSchema } from '../_schemas/progress-event.schema';

describe('progressEventSchema', () => {
  it('validates a valid note event', () => {
    const input = {
      type: 'NOTE_ADDED' as const,
      note: 'Inspected water pressure valve on 4th floor.',
    };
    const result = progressEventSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('NOTE_ADDED');
      expect(result.data.note).toBe('Inspected water pressure valve on 4th floor.');
    }
  });

  it('validates work started event with status transition', () => {
    const input = {
      type: 'WORK_STARTED' as const,
      status: 'IN_PROGRESS' as const,
      note: 'Commencing work on site.',
    };
    const result = progressEventSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('WORK_STARTED');
      expect(result.data.status).toBe('IN_PROGRESS');
    }
  });

  it('rejects notes exceeding 2000 characters', () => {
    const input = {
      type: 'NOTE_ADDED' as const,
      note: 'a'.repeat(2001),
    };
    const result = progressEventSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('allows empty note for simple status transitions', () => {
    const input = {
      type: 'STATUS_CHANGED' as const,
      status: 'COMPLETED' as const,
      note: '',
    };
    const result = progressEventSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
