export const WORKFLOW_LAYOUT = {
  horizontalGap: 400,
  verticalGap: 450,
  collisionX: 350,
  collisionY: 400,
  gridColumns: 8,
  maxAttempts: 240,
} as const;

export interface WorkflowPoint {
  x: number;
  y: number;
}

export interface PositionedWorkflowNode {
  position: WorkflowPoint;
}

export const positionsCollide = (a: WorkflowPoint, b: WorkflowPoint) =>
  Math.abs(a.x - b.x) < WORKFLOW_LAYOUT.collisionX &&
  Math.abs(a.y - b.y) < WORKFLOW_LAYOUT.collisionY;

/**
 * Finds a free cell near an origin without allowing a single busy row or
 * column to push new work indefinitely off-screen.
 */
export function findFreeGridPosition(
  origin: WorkflowPoint,
  nodes: PositionedWorkflowNode[],
  columns: number = WORKFLOW_LAYOUT.gridColumns,
): WorkflowPoint {
  const safeColumns = Math.max(1, Math.floor(columns));
  for (let attempt = 0; attempt < WORKFLOW_LAYOUT.maxAttempts; attempt += 1) {
    const candidate = {
      x: origin.x + (attempt % safeColumns) * WORKFLOW_LAYOUT.horizontalGap,
      y: origin.y + Math.floor(attempt / safeColumns) * WORKFLOW_LAYOUT.verticalGap,
    };
    if (!nodes.some(node => positionsCollide(node.position, candidate))) return candidate;
  }
  const lowestOccupiedY = nodes.reduce((lowest, node) => Math.max(lowest, node.position.y), origin.y);
  return {
    x: origin.x,
    y: Math.max(
      origin.y + Math.ceil(WORKFLOW_LAYOUT.maxAttempts / safeColumns) * WORKFLOW_LAYOUT.verticalGap,
      lowestOccupiedY + WORKFLOW_LAYOUT.verticalGap,
    ),
  };
}

/**
 * Keeps derived nodes visually beside their parent. Repeated results fill the
 * row from left to right and wrap after the shared workflow column count.
 */
export function findDerivedNodePosition(
  parent: WorkflowPoint,
  nodes: PositionedWorkflowNode[],
): WorkflowPoint {
  const origin = {
    x: parent.x + WORKFLOW_LAYOUT.horizontalGap,
    y: parent.y,
  };
  return findFreeGridPosition(origin, nodes, WORKFLOW_LAYOUT.gridColumns);
}

/**
 * Allocates a stable row-major batch without moving any existing node.
 * The origin is always treated as the first cell of the batch.
 */
export function allocateGridPositions(
  origin: WorkflowPoint,
  count: number,
  nodes: PositionedWorkflowNode[],
  columns: number = WORKFLOW_LAYOUT.gridColumns,
): WorkflowPoint[] {
  const reserved = [...nodes];
  const positions: WorkflowPoint[] = [];
  for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) {
    const position = findFreeGridPosition(origin, reserved, columns);
    positions.push(position);
    reserved.push({ position });
  }
  return positions;
}

/**
 * Walks the fixed generation grid cell by cell, including row wrapping.
 * This prevents a collision in the last column from creating a seventh column.
 */
export function findFreeGenerationPosition(
  origin: WorkflowPoint,
  nodes: PositionedWorkflowNode[],
  rowStartX = 100,
): WorkflowPoint {
  let candidate = origin;
  for (let attempt = 0; attempt < WORKFLOW_LAYOUT.maxAttempts; attempt += 1) {
    if (!nodes.some(node => positionsCollide(node.position, candidate))) return candidate;
    candidate = advanceGenerationGrid(candidate, rowStartX);
  }
  const lowestOccupiedY = nodes.reduce((lowest, node) => Math.max(lowest, node.position.y), candidate.y);
  return { x: rowStartX, y: lowestOccupiedY + WORKFLOW_LAYOUT.verticalGap };
}

export function advanceGenerationGrid(
  position: WorkflowPoint,
  rowStartX = 100,
): WorkflowPoint {
  const column = Math.max(0, Math.round((position.x - rowStartX) / WORKFLOW_LAYOUT.horizontalGap));
  return column + 1 >= WORKFLOW_LAYOUT.gridColumns
    ? { x: rowStartX, y: position.y + WORKFLOW_LAYOUT.verticalGap }
    : { x: rowStartX + (column + 1) * WORKFLOW_LAYOUT.horizontalGap, y: position.y };
}
