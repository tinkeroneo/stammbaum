export function clampViewport(view, bounds, width, height) {
  if (!bounds || !width || !height) return { ...view };
  const guard = Math.min(140, Math.max(72, Math.min(width, height) * 0.18));
  const centerX = width / 2;
  const centerY = height / 2;
  const minX = guard - bounds.maxX * view.s - centerX;
  const maxX = width - guard - bounds.minX * view.s - centerX;
  const minY = guard - bounds.maxY * view.s - centerY;
  const maxY = height - guard - bounds.minY * view.s - centerY;
  return {
    ...view,
    x: Math.min(maxX, Math.max(minX, view.x)),
    y: Math.min(maxY, Math.max(minY, view.y))
  };
}
