import assert from 'node:assert/strict';
import { calculateFloatingDropdownPlacement } from '../src/lib/floatingDropdown';

const common = {
  triggerLeft: 100,
  triggerWidth: 300,
  contentHeight: 168,
  viewportHeight: 800,
  viewportWidth: 1200,
};

const downward = calculateFloatingDropdownPlacement({ ...common, triggerTop: 200, triggerBottom: 248 });
assert.equal(downward.direction, 'down');
assert.equal(downward.top, 252);
assert.equal(downward.maxHeight, 176);

const upward = calculateFloatingDropdownPlacement({ ...common, triggerTop: 690, triggerBottom: 738 });
assert.equal(upward.direction, 'up');
assert.equal(upward.top, 518);
assert.equal(upward.maxHeight, 176);

const shortMenuNearBottom = calculateFloatingDropdownPlacement({ ...common, triggerTop: 690, triggerBottom: 738, contentHeight: 36 });
assert.equal(shortMenuNearBottom.direction, 'down');
assert.equal(shortMenuNearBottom.maxHeight, 50);

const constrained = calculateFloatingDropdownPlacement({ ...common, triggerTop: 80, triggerBottom: 128, contentHeight: 400, viewportHeight: 220 });
assert.equal(constrained.direction, 'down');
assert.equal(constrained.maxHeight, 80);

const clampedHorizontally = calculateFloatingDropdownPlacement({ ...common, triggerTop: 200, triggerBottom: 248, triggerLeft: 1140, triggerWidth: 300 });
assert.equal(clampedHorizontally.left, 892);
assert.equal(clampedHorizontally.width, 300);

const narrowViewport = calculateFloatingDropdownPlacement({ ...common, triggerTop: 200, triggerBottom: 248, triggerLeft: 0, triggerWidth: 300, viewportWidth: 280 });
assert.equal(narrowViewport.left, 8);
assert.equal(narrowViewport.width, 264);

console.log('floating dropdown tests passed');
