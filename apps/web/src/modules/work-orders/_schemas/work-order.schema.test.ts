import { describe, expect, it } from 'vitest';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
} from './work-order.schema';

describe('work-order.schema', () => {
  describe('createWorkOrderSchema', () => {
    it('validates a valid create payload without scheduling', () => {
      const valid = {
        title: 'Repair HVAC unit',
        description: 'Compressor is leaking fluid on 4th floor',
        siteName: 'Main Campus Bldg A',
        priority: 'HIGH',
      };
      const result = createWorkOrderSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects payload with title shorter than 2 characters', () => {
      const invalid = {
        title: 'A',
        description: 'Compressor is leaking fluid on 4th floor',
        siteName: 'Main Campus Bldg A',
        priority: 'HIGH',
      };
      const result = createWorkOrderSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects scheduledStart after scheduledEnd', () => {
      const now = Date.now();
      const invalid = {
        title: 'Repair HVAC unit',
        description: 'Compressor is leaking fluid on 4th floor',
        siteName: 'Main Campus Bldg A',
        priority: 'HIGH',
        scheduledStart: new Date(now + 2 * 3600 * 1000).toISOString(),
        scheduledEnd: new Date(now + 1 * 3600 * 1000).toISOString(),
      };
      const result = createWorkOrderSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('updateWorkOrderSchema', () => {
    it('accepts valid update payload', () => {
      const valid = {
        title: 'Updated HVAC Title',
        description: 'Updated detailed description',
        siteName: 'HQ West Wing',
        priority: 'URGENT',
      };
      const result = updateWorkOrderSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Updated HVAC Title');
        expect(result.data.priority).toBe('URGENT');
      }
    });

    it('rejects description longer than 1000 characters', () => {
      const invalid = {
        title: 'Valid Title',
        description: 'x'.repeat(1001),
        siteName: 'HQ West Wing',
        priority: 'LOW',
      };
      const result = updateWorkOrderSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid priority value', () => {
      const invalid = {
        title: 'Valid Title',
        description: 'Valid Description',
        siteName: 'HQ West Wing',
        priority: 'SUPER_URGENT',
      };
      const result = updateWorkOrderSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
