import { describe, expect, it } from 'vitest';
import { visibilityAdjustment } from './viewport-visibility';
describe('focused input visibility', () => {
  it('leaves visible inputs alone and adds only measured occluded space', () => {
    expect(
      visibilityAdjustment(
        { top: 100, bottom: 144 },
        { offsetTop: 0, height: 400, scale: 1 },
        800,
      ),
    ).toEqual({ scrollBy: 0, space: 400 });
  });
  it('scrolls an obscured input the minimum distance including viewport offset', () => {
    expect(
      visibilityAdjustment(
        { top: 500, bottom: 544 },
        { offsetTop: 50, height: 400, scale: 1 },
        800,
      ),
    ).toEqual({ scrollBy: 110, space: 350 });
    expect(
      visibilityAdjustment(
        { top: 20, bottom: 64 },
        { offsetTop: 50, height: 400, scale: 1 },
        800,
      ).scrollBy,
    ).toBe(-42);
  });
  it('does not interfere with pinch zoom or create negative space', () => {
    expect(
      visibilityAdjustment(
        { top: 500, bottom: 544 },
        { offsetTop: 0, height: 300, scale: 2 },
        800,
      ),
    ).toEqual({ scrollBy: 0, space: 0 });
    expect(
      visibilityAdjustment(
        { top: 100, bottom: 144 },
        { offsetTop: 0, height: 900, scale: 1 },
        800,
      ).space,
    ).toBe(0);
  });
});
