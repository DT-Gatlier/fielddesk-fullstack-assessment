'use client';
import { useEffect, useRef } from 'react';
import { visibilityAdjustment } from '../_utils/viewport-visibility';

export function observeInputVisibility(
  form: HTMLFormElement,
  viewport: VisualViewport,
) {
  let frame = 0;
  const layout = form.closest<HTMLElement>('.login-layout');
  const update = () => {
    frame = 0;
    // Leave layout and scroll untouched during a pinch gesture.
    if (viewport.scale !== 1) return;
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement) || !form.contains(input)) {
      layout?.style.removeProperty('--viewport-scroll-space');
      return;
    }
    const { scrollBy, space } = visibilityAdjustment(
      input.getBoundingClientRect(),
      viewport,
      window.innerHeight,
    );
    layout?.style.setProperty('--viewport-scroll-space', `${space}px`);
    if (scrollBy) window.scrollBy({ top: scrollBy, behavior: 'instant' });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  form.addEventListener('focusin', schedule);
  form.addEventListener('focusout', schedule);
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  return () => {
    cancelAnimationFrame(frame);
    form.removeEventListener('focusin', schedule);
    form.removeEventListener('focusout', schedule);
    viewport.removeEventListener('resize', schedule);
    viewport.removeEventListener('scroll', schedule);
    layout?.style.removeProperty('--viewport-scroll-space');
  };
}
export function useInputVisibility() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!ref.current || !window.visualViewport) return;
    return observeInputVisibility(ref.current, window.visualViewport);
  }, []);
  return ref;
}
