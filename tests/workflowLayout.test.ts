import assert from 'node:assert/strict';
import {
  WORKFLOW_LAYOUT,
  advanceGenerationGrid,
  allocateGridPositions,
  findDerivedNodePosition,
  findFreeGenerationPosition,
  findFreeGridPosition,
  positionsCollide,
} from '../src/lib/workflowLayout';

const nodeAt = (x: number, y: number) => ({ position: { x, y } });

assert.deepEqual(findFreeGridPosition({ x: 100, y: 100 }, []), { x: 100, y: 100 });
assert.deepEqual(findFreeGridPosition({ x: 100, y: 100 }, [nodeAt(100, 100)]), { x: 500, y: 100 });

const occupiedFirstRow = Array.from({ length: WORKFLOW_LAYOUT.gridColumns }, (_, index) =>
  nodeAt(100 + index * WORKFLOW_LAYOUT.horizontalGap, 100),
);
assert.deepEqual(findFreeGridPosition({ x: 100, y: 100 }, occupiedFirstRow), { x: 100, y: 550 });
assert.deepEqual(findFreeGridPosition({ x: 100, y: 100 }, [nodeAt(100, 100)], 0), { x: 100, y: 550 });

const derivedOrigin = { x: 500, y: 100 };
assert.deepEqual(findDerivedNodePosition({ x: 100, y: 100 }, []), derivedOrigin);
assert.deepEqual(
  findDerivedNodePosition({ x: 100, y: 100 }, [nodeAt(500, 100)]),
  { x: 900, y: 100 },
);

const derivedBatch = allocateGridPositions({ x: 500, y: 100 }, 9, []);
assert.deepEqual(derivedBatch.slice(0, 8), Array.from({ length: 8 }, (_, index) => ({ x: 500 + index * 400, y: 100 })));
assert.deepEqual(derivedBatch[8], { x: 500, y: 550 });

assert.equal(positionsCollide({ x: 100, y: 100 }, { x: 449, y: 499 }), true);
assert.equal(positionsCollide({ x: 100, y: 100 }, { x: 450, y: 500 }), false);
assert.equal(positionsCollide({ x: 100, y: 100 }, { x: 450, y: 100 }), false);
assert.equal(positionsCollide({ x: 100, y: 100 }, { x: 100, y: 500 }), false);

assert.deepEqual(advanceGenerationGrid({ x: 100, y: 100 }), { x: 500, y: 100 });
assert.deepEqual(advanceGenerationGrid({ x: 2100, y: 100 }), { x: 2500, y: 100 });
assert.deepEqual(advanceGenerationGrid({ x: 2900, y: 100 }), { x: 100, y: 550 });
assert.deepEqual(advanceGenerationGrid({ x: 260, y: 100 }), { x: 500, y: 100 });

assert.deepEqual(
  findFreeGenerationPosition({ x: 2100, y: 100 }, [nodeAt(2100, 100)]),
  { x: 2500, y: 100 },
);

const fullyOccupiedGrid = Array.from({ length: WORKFLOW_LAYOUT.maxAttempts }, (_, index) =>
  nodeAt(
    100 + (index % WORKFLOW_LAYOUT.gridColumns) * WORKFLOW_LAYOUT.horizontalGap,
    100 + Math.floor(index / WORKFLOW_LAYOUT.gridColumns) * WORKFLOW_LAYOUT.verticalGap,
  ),
);
const fallback = findFreeGridPosition({ x: 100, y: 100 }, fullyOccupiedGrid);
assert.deepEqual(fallback, {
  x: 100,
  y: 100 + Math.ceil(WORKFLOW_LAYOUT.maxAttempts / WORKFLOW_LAYOUT.gridColumns) * WORKFLOW_LAYOUT.verticalGap,
});
assert.equal(fullyOccupiedGrid.some(node => positionsCollide(node.position, fallback)), false);

console.log('workflow layout tests passed');
