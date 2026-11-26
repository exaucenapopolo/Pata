export function shouldShowScrollAction({ windowY = 0, mainY = 0, threshold = 240 } = {}) {
  const normalizedThreshold = Math.max(0, Number(threshold) || 0);
  return Math.max(0, Number(windowY) || 0, Number(mainY) || 0) > normalizedThreshold;
}
