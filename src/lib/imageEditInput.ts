export const MODEL_EDIT_INPUT_MAX_EDGE = 2048;

export const fitImageWithinEdge = (
  width: number,
  height: number,
  maxEdge = MODEL_EDIT_INPUT_MAX_EDGE,
): { width: number; height: number; scale: number } => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  };
};
