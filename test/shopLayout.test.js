import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { SHOP_LAYOUT } from '../src/data/shopLayout.generated.js';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { murmurHash2 } from '../scripts/lib/murmurhash2.mjs';

const API_ITEM_IDS = JSON.parse(readFileSync(new URL('./fixtures/deadlock-api-item-ids.json', import.meta.url), 'utf8'));
const REQUIRED_SURFACES = [
  'card_backer_png',
  'catalog/backer_star_test_png',
  'catalog/catalog_shop_bg_spirit_psd',
  'catalog/catalog_shop_bg_vitality_psd',
  'catalog/catalog_shop_bg_weapon_psd',
  'catalog/catalog_shop_tab_shape_psd',
  'catalog/catalog_shop_tab_edge_overlay_psd',
  'catalog/catalog_shop_tab_icon_all_psd',
  'catalog/catalog_shop_tab_icon_recommendations_psd',
  'catalog/catalog_shop_tab_icon_builds_psd',
  'catalog/catalog_shop_tab_icon_spirit_psd',
  'catalog/catalog_shop_tab_icon_vitality_psd',
  'catalog/catalog_shop_tab_icon_weapon_psd',
  'catalog/catalog_shop_generic_bg2_psd',
  'catalog/catalog_shop_popular_bg_psd',
  'catalog/catalog_shop_top_recommendations_header_psd',
  'catalog/catalog_shop_filter_bg_psd',
  'catalog/catalog_shop_builds_header_bg_psd',
  'catalog/filters/shop_filtered_tree_header_full_psd',
  'catalog/pricetag_tier1_psd',
  'catalog/pricetag_tier2_psd',
  'catalog/pricetag_tier3_psd',
  'catalog/pricetag_tier4_psd',
  'catalog/price_currency_psd',
  'catalog/catalog_tooltip_header_spirit_psd',
  'catalog/catalog_tooltip_header_vitality_psd',
  'catalog/catalog_tooltip_header_weapon_psd'
];
for (const category of ['spirit', 'vitality', 'weapon']) {
  for (let tier = 1; tier <= 4; tier += 1) REQUIRED_SURFACES.push(`catalog/cards/card_backer_${category}_t${tier}_psd`);
}
for (let index = 1; index <= 3; index += 1) {
  REQUIRED_SURFACES.push(`catalog/cards/icon_mask0${index}_psd`, `catalog/cards/shopitem_papertexture0${index}_psd`);
}
for (let index = 1; index <= 4; index += 1) REQUIRED_SURFACES.push(`catalog/cards/shopitem_paperwear0${index}_psd`);

function tierRegions(category) {
  return Object.fromEntries(Object.entries(SHOP_LAYOUT.categoryTiers[category]).map(([tier, { x, y, width }]) => [tier, { x, y, width }]));
}

test('stock category tier regions match the verified in-game shop', () => {
  const topTiers = { 1: { x: 44, y: 120, width: 500 }, 2: { x: 510, y: 10, width: 540 } };
  assert.deepEqual(tierRegions('weapon'), {
    ...topTiers,
    3: { x: 44, y: 480, width: 600 },
    4: { x: 674, y: 480, width: 400 }
  });
  assert.deepEqual(tierRegions('vitality'), {
    ...topTiers,
    3: { x: 44, y: 480, width: 500 },
    4: { x: 510, y: 480, width: 550 }
  });
  assert.deepEqual(tierRegions('spirit'), {
    ...topTiers,
    3: { x: 44, y: 480, width: 500 },
    4: { x: 510, y: 480, width: 560 }
  });
});

test('stock layout preserves panel size, flow, margins, and navigation order', () => {
  assert.equal(Object.isFrozen(SHOP_LAYOUT), true);
  assert.deepEqual(SHOP_LAYOUT.mainPanel, { width: 1200, height: 960 });
  assert.deepEqual(SHOP_LAYOUT.mod, { width: 76, height: 114, margin: 3 });
  assert.equal(SHOP_LAYOUT.passiveModsFlow, 'right-wrap');
  assert.deepEqual(SHOP_LAYOUT.modTiersMargin, { top: 0, right: 12, bottom: 0, left: 12 });
  assert.deepEqual(SHOP_LAYOUT.emptyTier, { opacity: 0.2, height: 40 });
  assert.deepEqual(SHOP_LAYOUT.navOrder, ['FavoritesNav', 'RecommendedNav', 'FilteredNav', 'WeaponNav', 'TechNav', 'ArmorNav']);
  for (const category of ['weapon', 'spirit', 'vitality']) {
    assert.deepEqual(SHOP_LAYOUT.categoryTiers[category][1].costLabel, { marginLeft: -20, marginTop: 0, marginBottom: 0 });
    assert.deepEqual(SHOP_LAYOUT.categoryTiers[category][2].costLabel, { marginLeft: -20, marginTop: -20, marginBottom: 20 });
    assert.deepEqual(SHOP_LAYOUT.categoryTiers[category][3].costLabel, { marginLeft: -18, marginTop: -21, marginBottom: 20 });
    assert.deepEqual(SHOP_LAYOUT.categoryTiers[category][4].costLabel, category === 'weapon'
      ? { marginLeft: 0, marginTop: -28, marginBottom: 26 }
      : { marginLeft: -15, marginTop: -31, marginBottom: 30 });
  }
  assert.ok(Number.isSafeInteger(SHOP_LAYOUT.provenance.clientVersion));
  assert.ok(SHOP_LAYOUT.provenance.clientVersion > 0);
  assert.deepEqual(SHOP_LAYOUT.provenance.files.map((file) => file.path), [
    'panorama/styles/citadel_hud_hero_shop.vcss_c',
    'panorama/styles/citadel_shop_mods_filtered.vcss_c',
    'panorama/styles/citadel_shop_mods_recommended.vcss_c',
    'panorama/styles/citadel_shop_mods_tier.vcss_c',
    'panorama/styles/citadel_shop_mod_view.vcss_c',
    'panorama/layout/citadel_hud_hero_shop.vxml_c'
  ]);
  for (const file of SHOP_LAYOUT.provenance.files) assert.match(file.crc, /^[0-9a-f]+$/, file.path);
});

test('every required shop surface has an optimized WebP asset', () => {
  for (const surface of REQUIRED_SURFACES) {
    const assetPath = `../public/assets/deadlock/panorama/images/shop/${surface}.webp`;
    assert.equal(existsSync(new URL(assetPath, import.meta.url)), true, assetPath);
  }
});

test('catalog stats ids match the recorded API and are unique unsigned 32-bit integers', () => {
  assert.equal(API_ITEM_IDS.source, 'https://api.deadlock-api.com/v1/assets/items/by-type/upgrade');
  assert.ok(Number.isFinite(Date.parse(API_ITEM_IDS.retrievedAt)));
  assert.equal(DEADLOCK_ITEMS.length, 156);
  assert.deepEqual(Object.keys(API_ITEM_IDS.items).sort(), DEADLOCK_ITEMS.map((item) => item.id).sort());
  const statsIds = new Set();
  for (const item of DEADLOCK_ITEMS) {
    assert.ok(Number.isInteger(item.statsId) && item.statsId >= 0 && item.statsId <= 0xffffffff, item.id);
    assert.equal(item.statsId, API_ITEM_IDS.items[item.id], item.id);
    assert.equal(murmurHash2(item.id.toLowerCase()), API_ITEM_IDS.items[item.id], item.id);
    assert.equal(statsIds.has(item.statsId), false, item.id);
    statsIds.add(item.statsId);
  }
});
