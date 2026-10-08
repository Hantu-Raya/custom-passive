import assert from 'node:assert/strict';
import test from 'node:test';
import { DEADLOCK_ITEMS, TIER_COSTS } from '../src/data/deadlockItems.generated.js';
import { TIER_BOARD_CATEGORIES, TIER_BOARD_COLUMNS, TIER_BOARD_TIERS, groupTierBoard } from '../src/lib/tierBoard.js';

const COUNTS = {
  weapon: [7, 16, 19, 11],
  spirit: [8, 12, 13, 16],
  vitality: [8, 15, 14, 17]
};

test('tier board groups the complete catalog into four price rows and three category cells', () => {
  assert.deepEqual(TIER_BOARD_CATEGORIES, ['weapon', 'spirit', 'vitality']);
  assert.deepEqual(TIER_BOARD_TIERS, [1, 2, 3, 4]);
  assert.equal(TIER_BOARD_COLUMNS, 4);
  const rows = groupTierBoard(DEADLOCK_ITEMS);
  assert.equal(rows.length, 4);
  for (const [index, row] of rows.entries()) {
    assert.equal(row.tier, index + 1);
    assert.equal(row.cost, TIER_COSTS[row.tier]);
    assert.deepEqual(row.cells.map((cell) => cell.category), TIER_BOARD_CATEGORIES);
    for (const cell of row.cells) {
      assert.equal(cell.items.length, COUNTS[cell.category][index], `${cell.category} tier ${row.tier}`);
      assert.ok(cell.items.every((item) => item.category === cell.category && item.tier === row.tier));
    }
  }
  const items = rows.flatMap((row) => row.cells.flatMap((cell) => cell.items));
  assert.equal(items.length, 156);
  assert.equal(new Set(items.map((item) => item.id)).size, 156);
  assert.deepEqual(items.map((item) => item.id).sort(), DEADLOCK_ITEMS.map((item) => item.id).sort());
});

test('empty input retains all four rows and all twelve empty cells', () => {
  const rows = groupTierBoard([]);
  assert.deepEqual(rows.map((row) => row.tier), TIER_BOARD_TIERS);
  for (const row of rows) {
    assert.equal(row.cost, TIER_COSTS[row.tier]);
    assert.equal(row.cells.length, 3);
    for (const cell of row.cells) assert.deepEqual(cell.items, []);
  }
});

test('grouping preserves input order and item identity without changing the input', () => {
  const items = [...DEADLOCK_ITEMS].reverse();
  const original = [...items];
  for (const row of groupTierBoard(items)) {
    for (const cell of row.cells) {
      const expected = original.filter((item) => item.tier === row.tier && item.category === cell.category);
      assert.deepEqual(cell.items, expected);
      for (const [index, item] of cell.items.entries()) assert.equal(item, expected[index]);
    }
  }
  assert.deepEqual(items, original);
});

test('grouping freezes the result, rows, cells and item arrays', () => {
  const rows = groupTierBoard(DEADLOCK_ITEMS);
  assert.ok(Object.isFrozen(rows));
  for (const row of rows) {
    assert.ok(Object.isFrozen(row));
    assert.ok(Object.isFrozen(row.cells));
    for (const cell of row.cells) {
      assert.ok(Object.isFrozen(cell));
      assert.ok(Object.isFrozen(cell.items));
    }
  }
  assert.throws(() => rows[0].cells[0].items.pop(), TypeError);
});
