import { TIER_COSTS } from '../data/deadlockItems.generated.js';

export const TIER_BOARD_CATEGORIES = Object.freeze(['weapon', 'spirit', 'vitality']);
export const TIER_BOARD_TIERS = Object.freeze([1, 2, 3, 4]);
export const TIER_BOARD_COLUMNS = 4;

export const CATEGORY_TIER_COLUMNS = Object.freeze({
  weapon: Object.freeze({ 1: 5, 2: 6, 3: 7, 4: 4 }),
  spirit: Object.freeze({ 1: 5, 2: 6, 3: 5, 4: 6 }),
  vitality: Object.freeze({ 1: 5, 2: 6, 3: 5, 4: 6 })
});

export function groupTierBoard(items) {
  return Object.freeze(TIER_BOARD_TIERS.map((tier) => Object.freeze({
    tier,
    cost: TIER_COSTS[tier],
    cells: Object.freeze(TIER_BOARD_CATEGORIES.map((category) => Object.freeze({
      category,
      items: Object.freeze(items.filter((item) => item.tier === tier && item.category === category))
    })))
  })));
}
