import assert from 'node:assert/strict';
import test from 'node:test';
import { DEADLOCK_ITEMS, PASSIVE_FLAG_TYPE_OFFSETS, TIER_COSTS } from '../src/data/deadlockItems.generated.js';

const CATEGORIES = new Set(['weapon', 'vitality', 'spirit']);

test('generated item catalog has required fields and matching offsets', () => {
  assert.ok(DEADLOCK_ITEMS.length > 0);
  const ids = new Set();
  for (const item of DEADLOCK_ITEMS) {
    assert.equal(typeof item.id, 'string');
    assert.equal(item.id.startsWith('upgrade_'), true, item.id);
    assert.equal(typeof item.label, 'string', item.id);
    assert.ok(item.label.length > 0, item.id);
    assert.equal(CATEGORIES.has(item.category), true, item.id);
    assert.equal(Number.isInteger(item.tier), true, item.id);
    assert.ok(item.tier >= 1 && item.tier <= 4, item.id);
    assert.equal(item.cost, TIER_COSTS[item.tier], item.id);
    assert.equal(Number.isInteger(PASSIVE_FLAG_TYPE_OFFSETS[item.id]), true, item.id);
    assert.equal(ids.has(item.id), false, item.id);
    ids.add(item.id);
  }
});
