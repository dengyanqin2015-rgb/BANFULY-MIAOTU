import assert from 'node:assert/strict';
import { fitImageWithinEdge, MODEL_EDIT_INPUT_MAX_EDGE } from '../src/lib/imageEditInput';

assert.deepEqual(fitImageWithinEdge(1024, 768), { width: 1024, height: 768, scale: 1 });
assert.deepEqual(fitImageWithinEdge(6000, 4000), { width: 2048, height: 1365, scale: MODEL_EDIT_INPUT_MAX_EDGE / 6000 });
assert.deepEqual(fitImageWithinEdge(3000, 6000), { width: 1024, height: 2048, scale: MODEL_EDIT_INPUT_MAX_EDGE / 6000 });

console.log('image edit input sizing tests passed');
