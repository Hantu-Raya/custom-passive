import { SHOP_FILTER_TREE } from '../data/shopFilters.generated.js';

export function filterSlug(id) {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function flattenFilters(tree = SHOP_FILTER_TREE) {
  return tree.flatMap((node) => [node, ...flattenFilters(node.children || [])]);
}

function leafIds(node) {
  return node.children ? node.children.flatMap(leafIds) : [node.id];
}

const LEAVES_BY_ID = new Map(flattenFilters().map((node) => [node.id, leafIds(node)]));

export function searchableText(item) {
  return `${item.id} ${item.label} ${item.description} ${item.category} tier ${item.tier}`.toLowerCase();
}

export function filterItems(items, activeFilterIds = [], query = '') {
  const active = [...activeFilterIds];
  const leaves = new Set(active.flatMap((id) => LEAVES_BY_ID.get(id) || []));
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => (!active.length || item.shopFilters.some((id) => leaves.has(id)))
    && (!normalizedQuery || searchableText(item).includes(normalizedQuery)));
}
