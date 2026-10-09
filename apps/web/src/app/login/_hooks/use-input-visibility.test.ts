import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeInputVisibility } from './use-input-visibility';

afterEach(() => vi.unstubAllGlobals());
describe('viewport listeners', () => {
  it('batches events, scrolls only obscured inputs and cleans up listeners and pending frames', () => {
    const formEvents = new EventTarget();
    const viewport = Object.assign(new EventTarget(), {
      offsetTop: 0,
      height: 400,
      scale: 1,
    });
    const properties = new Map<string, string>();
    const layout = {
      style: {
        setProperty: (key: string, value: string) => properties.set(key, value),
        removeProperty: (key: string) => properties.delete(key),
      },
    };
    class Input {
      getBoundingClientRect() {
        return { top: 500, bottom: 544 };
      }
    }
    const input = new Input();
    const form = Object.assign(formEvents, {
      closest: () => layout,
      contains: (element: unknown) => element === input,
    });
    let callback: FrameRequestCallback = () => {};
    const raf = vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    });
    const cancel = vi.fn();
    const scroll = vi.fn();
    vi.stubGlobal('HTMLInputElement', Input);
    vi.stubGlobal('document', { activeElement: input });
    vi.stubGlobal('window', { innerHeight: 800, scrollBy: scroll });
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const cleanup = observeInputVisibility(
      form as unknown as HTMLFormElement,
      viewport as unknown as VisualViewport,
    );
    form.dispatchEvent(new Event('focusin'));
    viewport.dispatchEvent(new Event('resize'));
    expect(raf).toHaveBeenCalledTimes(1);
    callback(0);
    expect(scroll).toHaveBeenCalledWith({ top: 160, behavior: 'instant' });
    expect(properties.get('--viewport-scroll-space')).toBe('400px');
    viewport.scale = 2;
    viewport.dispatchEvent(new Event('resize'));
    callback(0);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(properties.get('--viewport-scroll-space')).toBe('400px');
    form.dispatchEvent(new Event('focusout'));
    cleanup();
    expect(properties.size).toBe(0);
    expect(cancel).toHaveBeenCalledWith(1);
    const count = raf.mock.calls.length;
    form.dispatchEvent(new Event('focusin'));
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    expect(raf).toHaveBeenCalledTimes(count);
  });
});
