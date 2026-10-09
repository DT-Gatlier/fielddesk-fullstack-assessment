export function visibilityAdjustment(
  rect: { top: number; bottom: number },
  viewport: { offsetTop: number; height: number; scale: number },
  layoutHeight: number,
) {
  if (viewport.scale !== 1) return { scrollBy: 0, space: 0 };
  const top = viewport.offsetTop + 12;
  const bottom = viewport.offsetTop + viewport.height - 16;
  return {
    scrollBy:
      rect.bottom > bottom
        ? rect.bottom - bottom
        : rect.top < top
          ? rect.top - top
          : 0,
    space: Math.max(0, layoutHeight - viewport.height - viewport.offsetTop),
  };
}
