import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEADLOCK_ITEMS, TIER_COSTS } from '../data/deadlockItems.generated.js';
import { SHOP_LAYOUT } from '../data/shopLayout.generated.js';
import { SHOP_FILTER_TREE, SHOP_FILTER_UI } from '../data/shopFilters.generated.js';
import { filterItems, filterSlug, flattenFilters } from '../lib/shopFilterSelection.js';
import { downloadBytes } from '../lib/download.js';
import { buildCompressedCustomPassivePackage, loadTemplateBytes, sha256Hex } from '../lib/packageBuilder.js';
import { assertCompletePassiveFlagOffsets, readPassiveFlagTemplate } from '../lib/source2PassiveFlags.js';
import { PRESET_TEMPLATE_IDS, PRESET_TEMPLATES, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../lib/presetTemplates.js';
import { CATEGORY_TIER_COLUMNS, TIER_BOARD_COLUMNS, groupTierBoard } from '../lib/tierBoard.js';
import { createLatestPopularRequest, createPopularItemsClient, getPopularItems, popularityLabel } from '../lib/popularItems.js';

const STORAGE_KEY = 'custom-passive:selected-items:v2';
const TEMPLATE_VERIFICATION_STORAGE_KEY = 'custom-passive:template-verification:v1';
const TEMPLATE_VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;
const KOFI_DONATION_URL = 'https://ko-fi.com/hantuaraya';
const KOFI_LEADERBOARD_URL = 'https://ko-fi.com/hantuaraya/leaderboard';
const SUPPORTERS = Object.freeze([
  Object.freeze({ rank: 1, displayName: 'civo', totalUsd: 100 }),
  Object.freeze({ rank: 2, displayName: 'www.skillnshred.com', totalUsd: 20 }),
  Object.freeze({ rank: 2, displayName: 'dacooder', totalUsd: 20 }),
  Object.freeze({ rank: 4, displayName: 'DimpuMudit', totalUsd: 17 }),
  Object.freeze({ rank: 5, displayName: 'oOBansh33', totalUsd: 10 }),
  Object.freeze({ rank: 5, displayName: 'Ko-fi Supporter', totalUsd: 10 }),
  Object.freeze({ rank: 7, displayName: 'Ko-fi Supporter', totalUsd: 5 }),
  Object.freeze({ rank: 7, displayName: 'greggey', totalUsd: 5 }),
  Object.freeze({ rank: 7, displayName: 'Timmcd', totalUsd: 5 })
]);
const SUPPORTER_SPEED_PX_PER_SECOND = 36;
const MIN_ANIMATION_SECONDS = 4;
const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});
function formatDonation(total) {
  return USD_FORMATTER.format(total);
}
const SHOP_IMAGE_BASE = `${import.meta.env.BASE_URL}assets/deadlock/panorama/images/shop/`;
const SHOP_ASSET_BASE = `${SHOP_IMAGE_BASE}catalog/`;
const TAB_ICONS = Object.freeze({
  selected: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_builds_psd.webp`,
  popular: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_recommendations_psd.webp`,
  all: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_all_psd.webp`,
  weapon: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_weapon_psd.webp`,
  spirit: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_spirit_psd.webp`,
  vitality: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_vitality_psd.webp`
});
const SHOP_BG_TABS = new Set(['weapon', 'vitality', 'spirit']);
const SHOP_BACKGROUNDS = Object.freeze({
  generic: `${SHOP_ASSET_BASE}catalog_shop_generic_bg2_psd.webp`,
  popular: `${SHOP_ASSET_BASE}catalog_shop_popular_bg_psd.webp`,
  weapon: `${SHOP_ASSET_BASE}catalog_shop_bg_weapon_psd.webp`,
  vitality: `${SHOP_ASSET_BASE}catalog_shop_bg_vitality_psd.webp`,
  spirit: `${SHOP_ASSET_BASE}catalog_shop_bg_spirit_psd.webp`
});
const SHOP_ICON_URLS = Object.freeze([...new Set(DEADLOCK_ITEMS.map((item) => item.iconUrl).filter(Boolean))].map((path) => `${import.meta.env.BASE_URL}${path}`));
const SHOP_CARD_ASSET_BASE = `${SHOP_ASSET_BASE}cards/`;
const SHOP_TOOLTIP_STAR = `${SHOP_ASSET_BASE}backer_star_test_png.webp`;
const TABS = Object.freeze([
  { id: 'selected', label: 'Selected' },
  { id: 'popular', label: 'Popular' },
  { id: 'all', label: 'All Items' },
  { id: 'weapon', label: 'Weapon' },
  { id: 'spirit', label: 'Spirit' },
  { id: 'vitality', label: 'Vitality' }
]);
const CATEGORY_GLYPHS = Object.freeze({ weapon: '✦', vitality: '✚', spirit: '⬡' });
const SHOP_CATEGORIES = Object.freeze(['weapon', 'vitality', 'spirit']);
const SHOP_ITEM_IDS_BY_CATEGORY = Object.freeze(Object.fromEntries(
  SHOP_CATEGORIES.map((category) => [
    category,
    Object.freeze(DEADLOCK_ITEMS.filter((item) => item.category === category).map((item) => item.id))
  ])
));
const CATEGORY_LABELS = Object.freeze({ selected: 'Selected', popular: 'Popular', all: 'All Items', weapon: 'Weapon', vitality: 'Vitality', spirit: 'Spirit' });
// Stock citadel_hud_hero_shop.css (#ShopModsContainer/.ShopNavigationTab)
// and citadel_shop_mods_filtered.css (.ModList/.CostLabel). Category art
// already contains the blank sticker shapes; only the teal prices are drawn.
const CATEGORY_BOARD_STOCK = Object.freeze({
  navWidth: 75,
  containerMarginRight: 20,
  rightTierMarginLeft: 20,
  listPaddingX: 11,
  listPaddingY: 6,
  listMarginY: 3,
  tierPaddingY: 10,
  labelPaddingTop: 30,
  labelMarginTop: 4,
  labelMarginBottom: -20,
  labelWidth: 80,
  labelMarginLeft: 16
});
const CATEGORY_BOARD_WIDTH = SHOP_LAYOUT.mainPanel.width - CATEGORY_BOARD_STOCK.navWidth - CATEGORY_BOARD_STOCK.containerMarginRight;
const stockBoardLength = (value) => `calc(${value} * var(--shop-unit))`;
const CATALOG_BOARD_SCALE = Object.freeze({
  '--category-board-aspect': CATEGORY_BOARD_WIDTH / SHOP_LAYOUT.mainPanel.height,
  '--shop-card-stock-width': SHOP_LAYOUT.mod.width,
  '--shop-card-scale': SHOP_LAYOUT.mod.width / CATEGORY_BOARD_WIDTH,
  '--shop-card-aspect': `${SHOP_LAYOUT.mod.width} / ${SHOP_LAYOUT.mod.height}`
});
const CATEGORY_BOARD_STYLE = Object.freeze({
  ...CATALOG_BOARD_SCALE,
  '--shop-unit': `calc(100cqw / ${CATEGORY_BOARD_WIDTH})`,
  '--shop-card-width': stockBoardLength(SHOP_LAYOUT.mod.width),
  '--shop-card-height': stockBoardLength(SHOP_LAYOUT.mod.height),
  // Use the stock 3px margin once between cells, with the verified wrap counts.
  '--shop-grid-gap': stockBoardLength(SHOP_LAYOUT.mod.margin),
  '--tier-label-width': stockBoardLength(CATEGORY_BOARD_STOCK.labelWidth),
  '--tier-label-margin-left': stockBoardLength(CATEGORY_BOARD_STOCK.labelMarginLeft)
});
const VALID_ITEM_IDS = new Set(DEADLOCK_ITEMS.map((item) => item.id));
const DUAL_BADGE_ITEM_IDS = new Set(['upgrade_ability_power_shard']);
const PREDICTIVE_HOVER_MIN_SPEED = 0.08;
const PREDICTIVE_HOVER_MAX_LOOKAHEAD = 140;
const PREDICTIVE_HOVER_MAX_HALF_WIDTH = 42;
const PREDICTIVE_HOVER_BASE_LOOKAHEAD = 18;
const PREDICTIVE_HOVER_BASE_HALF_WIDTH = 6;
const PREDICTIVE_HOVER_MAX_HIT_PADDING = 14;
const PREDICTIVE_HOVER_MAX_ENTRY_DISTANCE = 36;
const PREDICTIVE_HOVER_VELOCITY_ALPHA = 0.32;
const SCALE_DEBUG_QUERY_VALUES = new Set(['icon-scale', 'tab-scale', 'tab-transition-scale']);

function isScaleDebugEnabled() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('debugScale') || SCALE_DEBUG_QUERY_VALUES.has(params.get('debug'));
}

function scaleDebugSelectionCategory() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const category = params.get('debugSelected') || params.get('debugSelection');
  return SHOP_CATEGORIES.includes(category) ? category : null;
}

function roundedMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function elementRect(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: roundedMetric(rect.x),
    y: roundedMetric(rect.y),
    width: roundedMetric(rect.width),
    height: roundedMetric(rect.height),
    right: roundedMetric(rect.right),
    bottom: roundedMetric(rect.bottom)
  };
}

function readScaleDebugMetrics({ activeTab, selectedCount, visibleCount, label }) {
  if (typeof document === 'undefined') return null;
  const board = document.querySelector('.catalog-board, .catalog-list-board');
  const cards = board ? [...board.querySelectorAll('.item-card')] : [];
  const firstCard = cards[0] || null;
  const firstIcon = firstCard?.querySelector('.item-icon') || null;
  const firstImage = firstCard?.querySelector('.item-icon img') || null;
  const boardRect = elementRect(board);
  const overflowCards = board && boardRect
    ? cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left < boardRect.x - 1 || rect.right > boardRect.right + 1 || rect.top < boardRect.y - 1 || rect.bottom > boardRect.bottom + 1;
    })
    : [];
  return {
    label,
    activeTab,
    selectedCount,
    visibleCount,
    boardClass: board?.className || null,
    board: boardRect,
    cardCount: cards.length,
    firstCard: elementRect(firstCard),
    firstIcon: elementRect(firstIcon),
    firstImage: elementRect(firstImage),
    firstImageComplete: firstImage ? firstImage.complete : null,
    css: board ? {
      cardWidth: getComputedStyle(board).getPropertyValue('--shop-card-width').trim(),
      gridGap: getComputedStyle(board).getPropertyValue('--shop-grid-gap').trim(),
      overflow: getComputedStyle(board).overflow,
      containerType: getComputedStyle(board).containerType
    } : null,
    firstCards: cards.slice(0, 8).map((card) => {
      const image = card.querySelector('.item-icon img');
      return {
        id: card.dataset.itemId,
        card: elementRect(card),
        icon: elementRect(card.querySelector('.item-icon')),
        image: elementRect(image),
        imageComplete: image ? image.complete : null
      };
    }),
    overflowCount: overflowCards.length,
    overflowIds: overflowCards.slice(0, 12).map((card) => card.dataset.itemId)
  };
}

function logScaleDebugMetrics(metrics) {
  if (!metrics) return;
  const message = `[custom-passive:scale] ${metrics.label} tab=${metrics.activeTab} cards=${metrics.cardCount} selected=${metrics.selectedCount} visible=${metrics.visibleCount}`;
  console.groupCollapsed(message);
  console.log(metrics);
  if (metrics.firstCards.length > 0) console.table(metrics.firstCards);
  console.groupEnd();
}

const PREDICTIVE_HOVER_SWITCH_MARGIN = 14;
const PREDICTIVE_HOVER_LOCK_MS = 70;
const PREDICTIVE_HOVER_MIN_DIRECTION_DOT = 0.65;
const ITEM_UPGRADE_LINKS = Object.freeze([
  ['upgrade_non_player_bonus', 'upgrade_non_player_bonus_sacrifice'],
  ['upgrade_chain_lightning', 'upgrade_capacitor'],
  ['upgrade_high_velocity_mag', 'upgrade_pristine_emblem'],
  ['upgrade_slowing_bullets', 'upgrade_weighted_shots'],
  ['upgrade_long_range', 'upgrade_sharpshooter'],
  ['upgrade_high_velocity_mag', 'upgrade_sharpshooter'],
  ['upgrade_headshot_booster', 'upgrade_headhunter'],
  ['upgrade_tech_defense_shredders', 'upgrade_spellslinger_headshots'],
  ['upgrade_headshot_booster2', 'upgrade_banshee_slugs'],
  ['upgrade_close_range', 'upgrade_close_quarter_combat'],
  ['upgrade_endurance', 'upgrade_healing_booster'],
  ['upgrade_health', 'upgrade_chonky'],
  ['upgrade_vampire', 'upgrade_damage_recycler'],
  ['upgrade_health_stealing_magic', 'upgrade_damage_recycler'],
  ['upgrade_sprint_booster', 'upgrade_trophy_collector'],
  ['upgrade_sprint_booster', 'upgrade_cardio_calibrator'],
  ['upgrade_improved_stamina', 'upgrade_superior_stamina'],
  ['upgrade_grit', 'upgrade_weapon_shielding'],
  ['upgrade_grit', 'upgrade_spirit_bubble'],
  ['upgrade_improved_spirit', 'upgrade_soaring_spirit'],
  ['upgrade_health_stealing_magic', 'upgrade_tech_overflow'],
  ['upgrade_magic_reach', 'upgrade_tech_range'],
  ['upgrade_magic_burst', 'upgrade_magic_shock'],
  ['upgrade_magic_vulnerability', 'upgrade_escalating_exposure'],
  ['upgrade_extra_charge', 'upgrade_rapid_recharge'],
  ['upgrade_magic_tempo', 'upgrade_cooldown_reduction'],
  ['upgrade_cooldown_reduction', 'upgrade_transcendent_cooldown'],
  ['upgrade_spirit_sap', 'upgrade_focus_lens'],
  ['upgrade_withering_whip', 'upgrade_greater_withering_whip'],
  ['upgrade_health_stimpak', 'upgrade_rescue_beam'],
  ['upgrade_containment', 'upgrade_aoe_root'],
  ['upgrade_health_stimpak', 'upgrade_health_nova'],
  ['upgrade_health_stealing_magic', 'upgrade_infuser'],
  ['upgrade_grit', 'upgrade_guardian_ward'],
  ['upgrade_guardian_ward', 'upgrade_divine_barrier'],
  ['upgrade_improved_stamina', 'upgrade_kinetic_sash'],
  ['upgrade_improved_stamina', 'upgrade_arcane_surge'],
  ['upgrade_debuff_reducer', 'upgrade_unstoppable'],
  ['upgrade_health', 'upgrade_colossus'],
  ['upgrade_cold_front', 'upgrade_arctic_blast'],
  ['upgrade_arcane_extension', 'upgrade_imbued_duration_extender'],
  ['upgrade_vampire', 'upgrade_fury_trance'],
  ['upgrade_vampire', 'upgrade_surging_power'],
  ['upgrade_lifestrike_gauntlets', 'upgrade_boxing_glove'],
  ['upgrade_acolytes_glove', 'upgrade_spirit_snatch'],
  ['upgrade_melee_charge', 'upgrade_crushing_fists'],
  ['upgrade_mystic_regeneration', 'upgrade_resonant_healing'],
  ['upgrade_soaring_spirit', 'upgrade_boundless_spirit'],
  ['upgrade_rapid_rounds', 'upgrade_burst_fire'],
  ['upgrade_improved_spirit', 'upgrade_magic_storm'],
  ['upgrade_quick_silver', 'upgrade_ethereal_bullets'],
  ['upgrade_clip_size', 'upgrade_reinforcing_casings'],
  ['upgrade_rapid_rounds', 'upgrade_blitz_bullets'],
  ['upgrade_sprint_booster', 'upgrade_veil_walker'],
  ['upgrade_grit', 'upgrade_vex_barrier'],
  ['upgrade_vex_barrier', 'upgrade_auto_cleanse'],
  ['upgrade_clip_size', 'upgrade_titan_round'],
  ['upgrade_magic_slow', 'upgrade_ultimate_burst'],
  ['upgrade_healing_booster', 'upgrade_healbuff'],
  ['upgrade_high_velocity_mag', 'upgrade_aprounds'],
  ['upgrade_debuff_reducer', 'upgrade_spellbreaker'],
  ['upgrade_cardio_calibrator', 'upgrade_juggernaut'],
  ['upgrade_high_velocity_mag', 'upgrade_express_shot'],
  ['upgrade_magic_reach', 'upgrade_bulletshredimbue']
]);
const RELATED_ITEM_IDS_BY_ID = ITEM_UPGRADE_LINKS.reduce((map, [fromId, toId]) => {
  if (!VALID_ITEM_IDS.has(fromId) || !VALID_ITEM_IDS.has(toId)) return map;
  const fromSet = map.get(fromId) || new Set();
  fromSet.add(toId);
  map.set(fromId, fromSet);
  const toSet = map.get(toId) || new Set();
  toSet.add(fromId);
  map.set(toId, toSet);
  return map;
}, new Map());

function createDefaultSelection() {
  return new Set(getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).presetItemIds);
}

function isRequiredTemplateSha256(hash) {
  return hash === REQUIRED_GAMEBANANA_TEMPLATE.sha256;
}

function loadStoredTemplateVerification() {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(TEMPLATE_VERIFICATION_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    const expiresAt = Number(parsed?.expiresAt);
    if (parsed?.sha256 === REQUIRED_GAMEBANANA_TEMPLATE.sha256 && Number.isFinite(expiresAt) && expiresAt > Date.now()) return true;
  } catch {
    // Bad localStorage data should behave like an expired verification.
  }
  window.localStorage.removeItem(TEMPLATE_VERIFICATION_STORAGE_KEY);
  return false;
}

function storeTemplateVerification() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TEMPLATE_VERIFICATION_STORAGE_KEY, JSON.stringify({
    sha256: REQUIRED_GAMEBANANA_TEMPLATE.sha256,
    expiresAt: Date.now() + TEMPLATE_VERIFICATION_TTL_MS
  }));
}

function loadStoredSelection() {
  if (typeof window === 'undefined') return createDefaultSelection();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultSelection();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createDefaultSelection();
    return new Set(parsed.filter((id) => typeof id === 'string' && VALID_ITEM_IDS.has(id)));
  } catch {
    return createDefaultSelection();
  }
}

function itemInitials(label) {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function itemNameClass(label) {
  const words = label.split(/[\s-]+/).filter(Boolean);
  const maxWordLength = words.reduce((max, word) => Math.max(max, word.length), 0);
  const compact = words.length >= 3;
  const dense = words.length >= 4 || label.length >= 22;
  const longWord = maxWordLength >= 11;
  const singleWord = words.length === 1;
  return [compact ? 'item-card-name-compact' : '', dense ? 'item-card-name-dense' : '', longWord ? 'item-card-name-long-word' : '', singleWord ? 'item-card-name-single-word' : ''].filter(Boolean).join(' ');
}


function stripMarkup(text) {
  return text.replace(/<[^>]*>/g, ' ').replace(/\{[^}]+}/g, '').replace(/\s+/g, ' ').trim();
}

function sortShopItems(items) {
  return [...items].sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

function createTierMap() {
  return new Map([1, 2, 3, 4].map((tier) => [tier, []]));
}

function categoryTierStyle(category, tier) {
  const region = SHOP_LAYOUT.categoryTiers[category][tier];
  const { costLabel } = region;
  const fontSize = costLabel.fontSize;
  const labelHeight = fontSize + CATEGORY_BOARD_STOCK.labelPaddingTop
    + CATEGORY_BOARD_STOCK.labelMarginTop + CATEGORY_BOARD_STOCK.labelMarginBottom;
  return {
    left: stockBoardLength(SHOP_LAYOUT.modTiersMargin.left + region.x + (tier % 2 === 0 ? CATEGORY_BOARD_STOCK.rightTierMarginLeft : 0)),
    top: stockBoardLength(SHOP_LAYOUT.modTiersMargin.top + region.y),
    width: stockBoardLength(region.width),
    '--tier-columns': CATEGORY_TIER_COLUMNS[category][tier],
    '--tier-grid-left': stockBoardLength(CATEGORY_BOARD_STOCK.listPaddingX + SHOP_LAYOUT.mod.margin),
    '--tier-grid-top': stockBoardLength(labelHeight + costLabel.marginTop + costLabel.marginBottom
      + CATEGORY_BOARD_STOCK.listMarginY + CATEGORY_BOARD_STOCK.listPaddingY
      + CATEGORY_BOARD_STOCK.tierPaddingY + SHOP_LAYOUT.mod.margin),
    '--tier-price-left': stockBoardLength(costLabel.marginLeft),
    '--tier-price-top': stockBoardLength(costLabel.marginTop + CATEGORY_BOARD_STOCK.labelPaddingTop + CATEGORY_BOARD_STOCK.labelMarginTop),
    '--tier-price-font-size': stockBoardLength(fontSize)
  };
}

function activationBadgesFor(item) {
  if (DUAL_BADGE_ITEM_IDS.has(item.id)) return ['imbue', 'active'];
  return item.activationBadge ? [item.activationBadge] : [];
}

function countVisibleSlots(slots) {
  let count = 0;
  for (const item of slots) {
    if (item) count += 1;
  }
  return count;
}

function distanceAlongPointerCone(x, y, dx, dy, length, halfWidth, rect) {
  const left = rect.left - halfWidth;
  const right = rect.right + halfWidth;
  const top = rect.top - halfWidth;
  const bottom = rect.bottom + halfWidth;
  let near = 0;
  let far = length;

  if (dx === 0) {
    if (x < left || x > right) return null;
  } else {
    const tx1 = (left - x) / dx;
    const tx2 = (right - x) / dx;
    near = Math.max(near, Math.min(tx1, tx2));
    far = Math.min(far, Math.max(tx1, tx2));
  }

  if (dy === 0) {
    if (y < top || y > bottom) return null;
  } else {
    const ty1 = (top - y) / dy;
    const ty2 = (bottom - y) / dy;
    near = Math.max(near, Math.min(ty1, ty2));
    far = Math.min(far, Math.max(ty1, ty2));
  }

  return near <= far ? near : null;
}

function pointerMotion(event, previousPointer) {
  const elapsed = Math.max(event.timeStamp - previousPointer.time, 1);
  const rawVx = (event.clientX - previousPointer.x) / elapsed;
  const rawVy = (event.clientY - previousPointer.y) / elapsed;
  const vx = previousPointer.vx === undefined ? rawVx : previousPointer.vx + (rawVx - previousPointer.vx) * PREDICTIVE_HOVER_VELOCITY_ALPHA;
  const vy = previousPointer.vy === undefined ? rawVy : previousPointer.vy + (rawVy - previousPointer.vy) * PREDICTIVE_HOVER_VELOCITY_ALPHA;
  const rawSpeed = Math.hypot(rawVx, rawVy);
  const speed = Math.max(Math.hypot(vx, vy), rawSpeed);
  return { rawVx, rawVy, rawSpeed, vx, vy, speed };
}

function hasStablePointerDirection(motion, previousPointer) {
  if (previousPointer.rawVx === undefined || previousPointer.rawVy === undefined) return true;
  const previousRawSpeed = Math.hypot(previousPointer.rawVx, previousPointer.rawVy);
  if (previousRawSpeed < PREDICTIVE_HOVER_MIN_SPEED || motion.rawSpeed < PREDICTIVE_HOVER_MIN_SPEED) return true;
  const directionDot = (motion.rawVx * previousPointer.rawVx + motion.rawVy * previousPointer.rawVy) / (motion.rawSpeed * previousRawSpeed);
  return directionDot >= PREDICTIVE_HOVER_MIN_DIRECTION_DOT;
}

function predictionVector(motion) {
  const directionSpeed = motion.rawSpeed || Math.hypot(motion.vx, motion.vy);
  return {
    dx: motion.rawVx / directionSpeed,
    dy: motion.rawVy / directionSpeed
  };
}

function predictedCardDistance(card, event, vector, lookahead, hitPadding) {
  const distance = distanceAlongPointerCone(
    event.clientX,
    event.clientY,
    vector.dx,
    vector.dy,
    lookahead,
    hitPadding,
    card.getBoundingClientRect()
  );
  return distance !== null && distance <= PREDICTIVE_HOVER_MAX_ENTRY_DISTANCE ? distance : null;
}

function findPredictedItemId(event, previousPointer, motion) {
  const lookahead = Math.min(PREDICTIVE_HOVER_BASE_LOOKAHEAD + motion.speed * 80, PREDICTIVE_HOVER_MAX_LOOKAHEAD);
  const halfWidth = Math.min(PREDICTIVE_HOVER_BASE_HALF_WIDTH + motion.speed * 28, PREDICTIVE_HOVER_MAX_HALF_WIDTH);
  const hitPadding = Math.min(halfWidth, PREDICTIVE_HOVER_MAX_HIT_PADDING);
  const vector = predictionVector(motion);
  let best = { itemId: null, distance: Number.POSITIVE_INFINITY };
  let currentDistance = null;

  for (const card of event.currentTarget.querySelectorAll('.item-card')) {
    const distance = predictedCardDistance(card, event, vector, lookahead, hitPadding);
    if (distance === null) continue;
    const itemId = card.dataset.itemId || null;
    if (itemId === previousPointer.itemId) currentDistance = distance;
    if (distance < best.distance) best = { itemId, distance };
  }

  if (
    best.itemId !== previousPointer.itemId &&
    currentDistance !== null &&
    best.distance + PREDICTIVE_HOVER_SWITCH_MARGIN >= currentDistance
  ) {
    return previousPointer.itemId;
  }

  return best.itemId;
}

function predictiveHoverState(event, previousPointer) {
  const directCard = event.target.closest?.('.item-card');
  if (!previousPointer || previousPointer.time === event.timeStamp) {
    return { itemId: directCard?.dataset.itemId || null, isDirect: Boolean(directCard) };
  }

  const motion = pointerMotion(event, previousPointer);
  if (motion.speed < PREDICTIVE_HOVER_MIN_SPEED || directCard) {
    return { itemId: directCard?.dataset.itemId || null, ...motion, isDirect: Boolean(directCard) };
  }
  if (!hasStablePointerDirection(motion, previousPointer)) {
    return { itemId: null, ...motion, isDirect: false };
  }

  return {
    itemId: findPredictedItemId(event, previousPointer, motion),
    ...motion,
    isDirect: false
  };
}

function shouldKeepLockedPrediction(event, previousPointer, nextPrediction, nextItemId) {
  return Boolean(
    nextPrediction.itemId &&
    !nextPrediction.isDirect &&
    previousPointer?.itemId &&
    previousPointer.itemId !== nextItemId &&
    event.timeStamp < previousPointer.lockUntil
  );
}

function nextHoverLockUntil(event, previousPointer, nextPrediction, nextItemId) {
  if (nextPrediction.isDirect || !nextItemId) return 0;
  if (previousPointer?.itemId !== nextItemId) return event.timeStamp + PREDICTIVE_HOVER_LOCK_MS;
  return previousPointer?.lockUntil || 0;
}

function pointerSampleFromEvent(event, nextPrediction, itemId, lockUntil) {
  return {
    x: event.clientX,
    y: event.clientY,
    time: event.timeStamp,
    vx: nextPrediction.vx,
    vy: nextPrediction.vy,
    rawVx: nextPrediction.rawVx,
    rawVy: nextPrediction.rawVy,
    itemId,
    lockUntil
  };
}




function ShopShell({ children, hoveringItem, onMouseMove, onMouseLeave }) {
  return (
    <main
      class={`shop-shell ${hoveringItem ? 'is-item-hovered' : ''}`}
      style={{ '--shop-ambient-bg': `url("${SHOP_BACKGROUNDS.generic}")` }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </main>
  );
}

function ShopTabs({ activeTab, onTabChange }) {
  return (
    <nav class="shop-tabs" aria-label="Shop categories" style={{ '--shop-tab-shape': `url("${SHOP_ASSET_BASE}catalog_shop_tab_shape_psd.webp")`, '--shop-tab-edge': `url("${SHOP_ASSET_BASE}catalog_shop_tab_edge_overlay_psd.webp")` }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          class={`shop-tab shop-tab-${tab.id} ${activeTab === tab.id ? 'is-active' : ''}`}
          data-testid={`tab-${tab.id}`}
          aria-pressed={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          aria-label={tab.label}
          title={tab.label}
        >
          <img src={TAB_ICONS[tab.id]} alt="" />
          <em>{tab.label}</em>
        </button>
      ))}
    </nav>
  );
}

function SearchBox({ query, onQueryChange }) {
  return (
    <div class="filter-search" role="search">
      <input id="shop-search" data-testid="search-input" type="search" aria-label="Search items" value={query} placeholder="Search items" onInput={(event) => onQueryChange(event.currentTarget.value)} />
      {query && <button type="button" data-testid="clear-search" aria-label="Clear search" onClick={() => onQueryChange('')}>×</button>}
    </div>
  );
}

function FilterOptions({ nodes, activeFilterIds, onSelect, depth = 0 }) {
  return nodes.map((node) => (
    <div key={node.id} class="filter-option-group">
      <button
        type="button" role="menuitemcheckbox" aria-checked={activeFilterIds.includes(node.id)}
        class={`filter-option ${node.children ? 'filter-option-heading' : ''}`}
        style={{ '--filter-depth': depth }} data-testid={`filter-option-${filterSlug(node.id)}`}
        onClick={() => onSelect(node.id, false)}
        onContextMenu={(event) => { event.preventDefault(); onSelect(node.id, true); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); onSelect(node.id, event.ctrlKey); }
        }}
      >
        <span class="filter-checkbox" aria-hidden="true">{activeFilterIds.includes(node.id) ? '✓' : ''}</span>
        <img class="filter-option-icon" src={`${import.meta.env.BASE_URL}${node.iconUrl}`} alt="" />
        <span>{node.label}</span>
      </button>
      {node.children && <FilterOptions nodes={node.children} activeFilterIds={activeFilterIds} onSelect={onSelect} depth={depth + 1} />}
    </div>
  ));
}

function ShopFilterBar({ query, onQueryChange, activeFilterIds, onSelect }) {
  const [openCategory, setOpenCategory] = useState(null);
  const barRef = useRef(null);
  const pointerTypeRef = useRef(null);
  const menuInputRef = useRef('keyboard');
  const suppressFocusRef = useRef(false);

  useEffect(() => {
    const closeOutside = (event) => {
      const menu = barRef.current?.querySelector('.filter-menu');
      const button = menu?.closest('.filter-category').querySelector('.filter-category-button');
      if (menu && !menu.contains(event.target) && !button.contains(event.target)) setOpenCategory(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  function menuKeyDown(event, category) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      suppressFocusRef.current = true;
      barRef.current.querySelector(`[data-testid="filter-category-${filterSlug(category.id)}"]`).focus();
      suppressFocusRef.current = false;
      setOpenCategory(null);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setOpenCategory(category.id);
    // Opening with a category arrow needs the newly rendered menu before focusing.
    requestAnimationFrame(() => {
      const options = [...(barRef.current?.querySelectorAll(`#filter-menu-${filterSlug(category.id)} [role="menuitemcheckbox"]`) || [])];
      if (!options.length) return;
      const index = options.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : event.key === 'ArrowDown' ? (index + 1) % options.length : (index < 0 ? options.length - 1 : (index - 1 + options.length) % options.length);
      options[next].focus();
    });
  }

  return (
    <div class="shop-filter-bar" ref={barRef} style={{ '--filter-nav-backer': `url("${SHOP_ASSET_BASE}filters/filter_nav_backer_psd.webp")`, '--filter-dot-pattern': `url("${SHOP_ASSET_BASE}filters/filter_backer_dot_pattern_psd.webp")` }}
      onPointerDown={(event) => { menuInputRef.current = event.pointerType === 'mouse' ? 'mouse' : 'touch'; }}
      onKeyDown={() => { menuInputRef.current = 'keyboard'; }}
      onFocusIn={(event) => { if (!event.target.closest('.filter-category')) setOpenCategory(null); }}
      onFocusOut={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        const ownerMenuId = event.target.closest('.filter-menu')?.id
          || event.target.closest('.filter-category-button')?.getAttribute('aria-controls');
        // Removing a focused old menu must not dismiss a newly hovered category.
        setOpenCategory((current) => current && ownerMenuId && ownerMenuId !== `filter-menu-${filterSlug(current)}` ? current : null);
      }}>
      <div class="filter-categories">
        {SHOP_FILTER_TREE.map((category) => (
          <div key={category.id} class={`filter-category ${openCategory === category.id ? 'is-open' : ''}`} style={{ '--filter-color': category.color }}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') {
                menuInputRef.current = 'mouse';
                setOpenCategory(category.id);
              }
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse' && menuInputRef.current === 'mouse') setOpenCategory((current) => current === category.id ? null : current);
            }}
            onKeyDown={(event) => menuKeyDown(event, category)}>
            <button type="button" class="filter-category-button" data-testid={`filter-category-${filterSlug(category.id)}`}
              aria-label={category.label} aria-haspopup="menu" aria-expanded={openCategory === category.id} aria-controls={`filter-menu-${filterSlug(category.id)}`}
              onPointerDown={(event) => { pointerTypeRef.current = event.pointerType; }}
              onFocus={() => {
                if (!suppressFocusRef.current && pointerTypeRef.current !== 'touch') {
                  menuInputRef.current = pointerTypeRef.current === 'mouse' ? 'mouse' : 'keyboard';
                  setOpenCategory(category.id);
                }
              }}
              onClick={() => {
                const isTouch = pointerTypeRef.current === 'touch';
                setOpenCategory((current) => isTouch && current === category.id ? null : category.id);
                pointerTypeRef.current = null;
              }}>
              <img src={`${import.meta.env.BASE_URL}${category.iconUrl}`} alt="" />
              <span>{category.label}</span>
            </button>
            {openCategory === category.id && (
              <div class="filter-menu" id={`filter-menu-${filterSlug(category.id)}`} role="menu" aria-label={`${category.label} filters`}>
                <FilterOptions nodes={category.children} activeFilterIds={activeFilterIds} onSelect={onSelect} />
                <div class="filter-help">{SHOP_FILTER_UI.helpLines.map((line) => <p key={line}>{line}</p>)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div><SearchBox query={query} onQueryChange={onQueryChange} /></div>
    </div>
  );
}

function ActiveFilters({ activeFilterIds, onRemove, onClear }) {
  if (!activeFilterIds.length) return null;
  const options = new Map(flattenFilters().map((node) => [node.id, node]));
  return (
    <div class="active-filters" data-testid="active-filters" style={{ '--filter-dot-pattern': `url("${SHOP_ASSET_BASE}filters/filter_backer_dot_pattern_psd.webp")` }}>
      <div class="active-filter-content">
        <span class="active-filters-label">{SHOP_FILTER_UI.activeLabel}</span>
        <div class="active-filter-chips">
          {activeFilterIds.map((id, index) => {
            const node = options.get(id);
            const category = SHOP_FILTER_TREE.find((entry) => id === entry.id || id.startsWith(`${entry.id}/`));
            return (
              <span key={id} class="active-filter-entry">
                {index > 0 && <span class="active-filter-or">{SHOP_FILTER_UI.orLabel}</span>}
                <button type="button" class="active-filter-chip" data-testid={`active-filter-${filterSlug(id)}`} style={{ '--filter-color': category.color }}
                  aria-label={`Remove ${category.label} > ${node.label}`} onClick={() => onRemove(id)}>
                  <span class="filter-checkbox" aria-hidden="true">✓</span>
                  <img class="filter-option-icon" src={`${import.meta.env.BASE_URL}${node.iconUrl}`} alt="" />
                  <span>{category.label} › {node.label}</span><span class="active-filter-remove" aria-hidden="true">×</span>
                </button>
              </span>
            );
          })}
        </div>
      </div>
      <button type="button" class="clear-filters" data-testid="clear-filters" onClick={onClear}>{SHOP_FILTER_UI.clearLabel}</button>
    </div>
  );
}
function SupporterSequence({ duplicate = false, sequenceRef = null }) {
  return (
    <span class="catalog-supporter-sequence" ref={sequenceRef} aria-hidden={duplicate ? 'true' : undefined}>
      {SUPPORTERS.map((supporter, index) => (
        <span
          class={`catalog-supporter-item${index < 3 ? ` catalog-supporter-place-${index + 1}` : ''}`}
          key={`${duplicate ? 'duplicate' : 'primary'}-${supporter.rank}-${supporter.displayName}-${supporter.totalUsd}`}
        >
          <span class="catalog-supporter-rank">{supporter.rank}</span>
          <span class="catalog-supporter-name">{supporter.displayName}</span>
          <span class="catalog-supporter-amount">{formatDonation(supporter.totalUsd)}</span>
        </span>
      ))}
    </span>
  );
}
function CatalogSupportFooter() {
  const [duration, setDuration] = useState(MIN_ANIMATION_SECONDS);
  const sequenceRef = useRef(null);

  useEffect(() => {
    const sequence = sequenceRef.current;
    if (!sequence) return undefined;
    const measureSequence = () => {
      const width = sequence.getBoundingClientRect().width || sequence.scrollWidth;
      if (width > 0) setDuration(Math.max(MIN_ANIMATION_SECONDS, width / SUPPORTER_SPEED_PX_PER_SECOND));
    };

    measureSequence();
    if ('ResizeObserver' in window) {
      const observer = new window.ResizeObserver(measureSequence);
      observer.observe(sequence);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measureSequence);
    return () => window.removeEventListener('resize', measureSequence);
  }, []);

  const accessibleLabel = `Ko-fi top supporters: ${SUPPORTERS.map((supporter) => `${supporter.rank} ${supporter.displayName} ${formatDonation(supporter.totalUsd)}`).join(', ')}`;

  return (
    <footer class="catalog-support-footer" aria-label="Support the project">
      <span class="catalog-support-copy">
        <strong>Back the next update</strong>
        <span>Donations fund hosting and release work.</span>
      </span>
      <span class="catalog-supporter-strip">
        <span class="catalog-supporter-label" aria-hidden="true">Top supporters</span>
        <a
          class="catalog-supporter-window"
          href={KOFI_LEADERBOARD_URL}
          target="_blank"
          rel="noreferrer"
          aria-label={accessibleLabel}
          data-testid="supporter-leaderboard-link"
        >
          <span class="catalog-supporter-track" aria-hidden="true" style={{ '--catalog-supporter-duration': `${duration}s` }}>
            <SupporterSequence sequenceRef={sequenceRef} />
            <SupporterSequence duplicate />
          </span>
        </a>
      </span>
      <a
        class="catalog-donation-link"
        data-testid="donation-link"
        href={KOFI_DONATION_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Donate on Ko-fi"
      >
        Donate
      </a>
    </footer>
  );
}


function BuildDownloadPanel({
  selectedCount,
  visibleCount,
  presetTemplateId,
  selectedPresetTemplate,
  templateReady,
  onPresetTemplateChange,
  onReset,
  onClear,
  onSelectVisible,
  onBuild,
  status
}) {
  const [showPresetDetails, setShowPresetDetails] = useState(false);

  return (
    <aside class="build-panel" aria-label="Build panel">
      <div class="build-panel-heading">
        <span class="eyebrow">Passive Builder</span>
        <h1>Custom shop passives</h1>
        <p>Choose which generated item records set <code>m_bShowInPassiveItemsArea</code>, then download a compressed archive containing the ready VPK.</p>
      </div>
      <dl class="build-stats">
        <div>
          <dt>Selected</dt>
          <dd data-testid="selected-count">{selectedCount}</dd>
        </div>
        <div>
          <dt>Archive</dt>
          <dd data-testid="output-filename">{selectedPresetTemplate.archiveOutputFileName}</dd>
        </div>
        <div>
          <dt>VPK inside</dt>
          <dd>{selectedPresetTemplate.outputFileName}</dd>
        </div>
        <div>
          <dt>Internal file</dt>
          <dd>scripts/abilities.vdata_c</dd>
        </div>
      </dl>
      <section class="preset-template-panel" aria-labelledby="preset-template-heading">
        <div class="preset-template-header">
          <h2 id="preset-template-heading">Build mode</h2>
          <span data-testid="preset-template-count">{selectedPresetTemplate.presetItemIds.length}</span>
        </div>
        <label for="preset-template-select">Preset</label>
        <select
          id="preset-template-select"
          data-testid="preset-template-select"
          value={presetTemplateId}
          onInput={(event) => onPresetTemplateChange(event.currentTarget.value)}
          onChange={(event) => onPresetTemplateChange(event.currentTarget.value)}
        >
          {PRESET_TEMPLATES.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
        <p>{selectedPresetTemplate.description} Preset selects {selectedPresetTemplate.presetItemIds.length} item{selectedPresetTemplate.presetItemIds.length === 1 ? '' : 's'}.</p>
        <button
          type="button"
          class="preset-template-toggle"
          data-testid="preset-template-details-toggle"
          aria-expanded={showPresetDetails}
          aria-controls="preset-template-details"
          onClick={() => setShowPresetDetails((isShown) => !isShown)}
        >
          {showPresetDetails ? 'Hide details' : 'Show details'}
        </button>
        <dl id="preset-template-details" class="preset-template-details" hidden={!showPresetDetails}>
          <div>
            <dt>Required archive</dt>
            <dd>{REQUIRED_GAMEBANANA_TEMPLATE.fileName}</dd>
          </div>
          <div>
            <dt>Archive SHA-256</dt>
            <dd data-testid="preset-template-archive-sha">{REQUIRED_GAMEBANANA_TEMPLATE.sha256}</dd>
          </div>
          <div>
            <dt>Build template SHA-256</dt>
            <dd data-testid="preset-template-sha">{selectedPresetTemplate.templateSha256}</dd>
          </div>
        </dl>
        <a
          class="gamebanana-template-link"
          data-testid="gamebanana-template-link"
          href={REQUIRED_GAMEBANANA_TEMPLATE.downloadPageUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open GameBanana page
        </a>
      </section>
      <div class="build-actions">
        <button type="button" data-testid="reset-defaults" onClick={onReset}>Reset selection</button>
        <button type="button" data-testid="clear-selection" onClick={onClear}>Clear all</button>
        <button type="button" onClick={onSelectVisible} disabled={visibleCount === 0}>Select all shown</button>
        <button type="button" class="primary-build" data-testid="build-download" onClick={onBuild} disabled={!templateReady}>Build / download archive</button>
      </div>
      <p class="build-status" role="status">{status}</p>
      <footer class="page-footer" aria-label="Project notices">
        <p>
          Unofficial, not affiliated with Valve. Archives stay local; the Popular tab contacts deadlock-api.com. Built by{' '}
          <a href="https://github.com/Hantu-Raya" target="_blank" rel="noreferrer">Hantu-Raya</a>.
          {' '}Source on{' '}
          <a href="https://github.com/Hantu-Raya/custom-passive" target="_blank" rel="noreferrer">GitHub</a>.
          {' '}Apache-2.0 licensed; see LICENSE and NOTICE.
        </p>
      </footer>
    </aside>
  );
}

function TemplateGate({
  presetTemplateId,
  selectedPresetTemplate,
  onPresetTemplateChange,
  onTemplateFile,
  status
}) {
  return (
    <div class="template-gate-backdrop" data-testid="template-gate">
      <section class="template-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="template-gate-heading">
        <span class="eyebrow">Template required</span>
        <h2 id="template-gate-heading">Link {REQUIRED_GAMEBANANA_TEMPLATE.fileName}</h2>
        <p>The builder needs the verified GameBanana template archive listed below before any VPK can be built.</p>
        <label for="template-gate-preset">Template type</label>
        <select
          id="template-gate-preset"
          data-testid="template-gate-preset"
          value={presetTemplateId}
          onInput={(event) => onPresetTemplateChange(event.currentTarget.value)}
          onChange={(event) => onPresetTemplateChange(event.currentTarget.value)}
        >
          {PRESET_TEMPLATES.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
        <dl class="preset-template-details">
          <div>
            <dt>Required archive</dt>
            <dd>{REQUIRED_GAMEBANANA_TEMPLATE.fileName}</dd>
          </div>
          <div>
            <dt>Archive SHA-256</dt>
            <dd>{REQUIRED_GAMEBANANA_TEMPLATE.sha256}</dd>
          </div>
          <div>
            <dt>Preset selected</dt>
            <dd>{selectedPresetTemplate.presetItemIds.length} item{selectedPresetTemplate.presetItemIds.length === 1 ? '' : 's'}</dd>
          </div>
        </dl>
        <a
          class="gamebanana-template-link"
          data-testid="template-gate-link"
          href={REQUIRED_GAMEBANANA_TEMPLATE.downloadPageUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open GameBanana page
        </a>
        <label
          class="template-gate-dropzone"
          for="template-gate-file"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer?.files?.[0];
            if (file) onTemplateFile(file);
          }}
        >
          <span>Upload / link {REQUIRED_GAMEBANANA_TEMPLATE.fileName}</span>
          <em>Use the exact archive listed above from GameBanana</em>
        </label>
        <input
          id="template-gate-file"
          class="template-gate-file"
          data-testid="template-gate-file"
          type="file"
          accept=".7z,application/x-7z-compressed"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onTemplateFile(file);
            event.currentTarget.value = '';
          }}
        />
        <p class="template-gate-status" data-testid="template-gate-status" aria-live="polite">{status}</p>
      </section>
    </div>
  );
}

function TierSection({ category, tier, slots, selectedIds, predictedHoverItemId, relatedHoverIds, onToggle }) {
  const visibleCount = countVisibleSlots(slots);
  return (
    <section class="tier-section" data-tier={tier} aria-labelledby={`tier-${tier}`} style={categoryTierStyle(category, tier)}>
      <div class="tier-heading">
        <h2 id={`tier-${tier}`}>${TIER_COSTS[tier].toLocaleString()} TIER {tier}</h2>
        <span>{visibleCount} item{visibleCount === 1 ? '' : 's'}</span>
      </div>
      <div class="tier-price">
        <span class="tier-price-label"><span class="tier-price-text">{TIER_COSTS[tier]}</span></span>
      </div>
      {visibleCount > 0 ? (
        <div class="item-grid">
          {slots.map((item, index) => (
            item
              ? <ItemCard key={item.id} item={item} index={index} selected={selectedIds.has(item.id)} predictedHover={predictedHoverItemId === item.id} relatedHover={relatedHoverIds.has(item.id)} onToggle={onToggle} />
              : <span key={`empty-${tier}-${index}`} class="item-slot-empty" aria-hidden="true" />
          ))}
        </div>
      ) : <p class="tier-empty">No matching items</p>}
    </section>
  );
}

function PopularHeader({ heroId, heroes, onHeroChange, data, error }) {
  return (
    <div class="popular-header">
      <div class="popular-header-art" aria-hidden="true" />
      <div class="popular-controls">
        <label htmlFor="popular-hero">Hero</label>
        <select id="popular-hero" data-testid="popular-hero-select" value={heroId ?? ''} onChange={(event) => onHeroChange(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}>
          <option value="">All heroes</option>
          {heroes.map((hero) => <option key={hero.id} value={hero.id}>{hero.name}</option>)}
        </select>
        <p aria-live="polite">{data ? popularityLabel(data) : 'Third-party popularity from deadlock-api.com, last 30 days.'}{error && ` ${error}`}</p>
      </div>
    </div>
  );
}

function tierRowIntrinsicHeight(cells) {
  const cardRows = Math.max(...cells.map((cell) => Math.ceil(cell.items.length / TIER_BOARD_COLUMNS)));
  const height = cardRows * SHOP_LAYOUT.mod.height + Math.max(0, cardRows - 1) * SHOP_LAYOUT.mod.margin;
  return `calc(${height} * var(--shop-unit) + 100cqw * 18 / 950 + 12px)`;
}

function TierBoard({ activeTab, items, query, onQueryChange, filters, popular, selectedIds, predictedHoverItemId, relatedHoverIds, onToggle }) {
  const rows = useMemo(() => groupTierBoard(items), [items]);
  return (
    <div
      class={`catalog-list-board catalog-list-board-${activeTab}`}
      style={{
        ...CATALOG_BOARD_SCALE,
        '--shop-unit': CATEGORY_BOARD_STYLE['--shop-unit'],
        '--shop-card-margin': SHOP_LAYOUT.mod.margin,
        '--catalog-list-bg': `url("${SHOP_BACKGROUNDS[activeTab === 'popular' ? 'popular' : 'generic']}")`,
        '--popular-header-bg': `url("${SHOP_ASSET_BASE}catalog_shop_top_recommendations_header_psd.webp")`,
        '--tier-board-columns': TIER_BOARD_COLUMNS,
        '--empty-tier-height': `${SHOP_LAYOUT.emptyTier.height}px`,
        '--empty-tier-opacity': SHOP_LAYOUT.emptyTier.opacity
      }}
    >
      {activeTab === 'all' && <ShopFilterBar query={query} onQueryChange={onQueryChange} activeFilterIds={filters.activeIds} onSelect={filters.onSelect} />}
      {activeTab === 'popular' && <PopularHeader {...popular} />}
      <div class="tier-board-scroller" tabIndex={0} role="region" aria-label={`${CATEGORY_LABELS[activeTab]} items by tier and category`}>
        <div class="tier-board-header">
          <img src={`${SHOP_ASSET_BASE}filters/shop_filtered_tree_header_full_psd.webp`} alt="Weapon, Spirit, Vitality" />
        </div>
        <div class="tier-board-rows">
          {items.length === 0 && <p class="tier-board-empty">{activeTab === 'popular' ? popular.emptyMessage : 'No matching items'}</p>}
          {rows.map(({ tier, cost, cells }) => (
            <section
              key={tier}
              class={`tier-board-row ${cells.every((cell) => cell.items.length === 0) ? 'is-empty-tier' : ''}`}
              data-tier={tier}
              aria-labelledby={`tier-board-price-${tier}`}
              style={{ '--tier-row-height': tierRowIntrinsicHeight(cells) }}
            >
              <h2 class="tier-board-price" id={`tier-board-price-${tier}`}>{cost}</h2>
              {cells.map(({ category, items: cellItems }) => (
                <div key={category} class="tier-board-cell" data-category={category} role="group" aria-label={`${CATEGORY_LABELS[category]} ${cost}`}>
                  {cellItems.map((item, index) => (
                    <ItemCard key={item.id} item={item} index={index} selected={selectedIds.has(item.id)} predictedHover={predictedHoverItemId === item.id} relatedHover={relatedHoverIds.has(item.id)} onToggle={onToggle} />
                  ))}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
      {activeTab === 'all' && <ActiveFilters activeFilterIds={filters.activeIds} onRemove={filters.onRemove} onClear={filters.onClear} />}
    </div>
  );
}

function ItemCard({ item, index, selected, predictedHover, relatedHover, onToggle }) {
  const activationBadges = activationBadgesFor(item);
  const plainDescription = stripMarkup(item.description);
  const textureIndex = (index % 3) + 1;
  const wearIndex = (index % 4) + 1;
  const nameClass = itemNameClass(item.label);
  const cardStyle = {
    '--card-backer': `url("${SHOP_CARD_ASSET_BASE}card_backer_${item.category}_t${item.tier}_psd.webp")`,
    '--card-mask': `url("${SHOP_IMAGE_BASE}card_backer_png.webp")`,
    '--icon-mask': `url("${SHOP_CARD_ASSET_BASE}icon_mask0${textureIndex}_psd.webp")`,
    '--paper-texture': `url("${SHOP_CARD_ASSET_BASE}shopitem_papertexture0${textureIndex}_psd.webp")`,
    '--paper-wear': `url("${SHOP_CARD_ASSET_BASE}shopitem_paperwear0${wearIndex}_psd.webp")`,
    '--tooltip-header': `url("${SHOP_ASSET_BASE}catalog_tooltip_header_${item.category}_psd.webp")`,
    '--tooltip-star': `url("${SHOP_TOOLTIP_STAR}")`
  };
  return (
    <span class={`item-hover-frame item-hover-frame-${item.category} ${predictedHover ? 'is-predicted-hover' : ''} ${relatedHover ? 'is-hover-related' : ''}`} style={cardStyle}>
      <span class="hover-texture hover-texture-primary" aria-hidden="true" />
      <span class="hover-texture hover-texture-secondary" aria-hidden="true" />
      <button
        type="button"
        class={`item-card item-card-${item.category} item-card-tier-${item.tier} ${selected ? 'is-selected' : 'is-off'} ${predictedHover ? 'is-predicted-hover' : ''} ${relatedHover ? 'is-hover-related' : ''} ${nameClass}`}
        data-testid={`item-card-${item.id}`}
        data-item-id={item.id}
        aria-pressed={selected}
        title={item.legacyRemoveWarning ? 'Legacy scripts removed this flag; custom output will still follow your selection.' : plainDescription}
        onClick={() => onToggle(item.id)}
      >
        {selected && <span class="selected-star" aria-hidden="true">★</span>}
        {activationBadges.length > 0 && (
          <span class={`item-activation-badges ${activationBadges.length > 1 ? 'item-activation-badges-stacked' : ''}`}>
            {activationBadges.map((badge) => <span key={badge} class={`item-activation-badge item-activation-badge-${badge}`}>{badge.toUpperCase()}</span>)}
          </span>
        )}
        <span class="item-icon" aria-hidden="true">
          {item.iconUrl ? <img src={`${import.meta.env.BASE_URL}${item.iconUrl}`} alt="" loading="eager" decoding="async" /> : <span><b>{CATEGORY_GLYPHS[item.category]}</b><em>{itemInitials(item.label)}</em></span>}
        </span>
        <span class="item-name"><span class="item-name-text">{item.label}</span></span>
      </button>
    </span>
  );
}

export default function CustomPassiveShop() {
  const [selectedIds, setSelectedIds] = useState(createDefaultSelection);
  const [selectionStorageReady, setSelectionStorageReady] = useState(false);
  const [activeTab, setActiveTab] = useState('selected');
  const [query, setQuery] = useState('');
  const [activeFilterIds, setActiveFilterIds] = useState([]);
  const [popularHeroId, setPopularHeroId] = useState(null);
  const [popularHeroes, setPopularHeroes] = useState([]);
  const [popularHeroError, setPopularHeroError] = useState('');
  const [popularState, setPopularState] = useState({ heroId: null, status: 'loading', data: null, error: '' });
  const popularClient = useMemo(() => createPopularItemsClient({ items: DEADLOCK_ITEMS }), []);
  const popularRequest = useMemo(() => createLatestPopularRequest(popularClient), [popularClient]);
  const [presetTemplateId, setPresetTemplateId] = useState(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);
  const [templateLinked, setTemplateLinked] = useState(loadStoredTemplateVerification);
  const [templateState, setTemplateState] = useState({ status: 'needed', bytes: null, offsets: null });
  const [templateGateOpen, setTemplateGateOpen] = useState(() => !templateLinked);
  const [status, setStatus] = useState(() => templateLinked
    ? `Template verification saved for 12 hours. Choose a preset, then build to load its template.`
    : `Template required. Upload ${REQUIRED_GAMEBANANA_TEMPLATE.fileName} to continue.`);
  const [predictedHoverItemId, setPredictedHoverItemId] = useState(null);
  const [directHoverItemId, setDirectHoverItemId] = useState(null);
  const pointerSampleRef = useRef(null);
  const selectedPresetTemplate = useMemo(() => getPresetTemplate(presetTemplateId), [presetTemplateId]);
  const supportedItemIds = useMemo(() => new Set(selectedPresetTemplate.supportedItemIds), [selectedPresetTemplate]);

  useEffect(() => {
    setSelectedIds(loadStoredSelection());
    setSelectionStorageReady(true);
  }, []);

  useEffect(() => {
    if (!selectionStorageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedIds].sort()));
  }, [selectedIds, selectionStorageReady]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.Image !== 'function') return;
    const preloadedImages = SHOP_ICON_URLS.map((src) => {
      const image = new window.Image();
      image.decoding = 'async';
      image.src = src;
      return image;
    });
    return () => {
      for (const image of preloadedImages) image.src = '';
    };
  }, []);

  useEffect(() => {
    if (!templateLinked || templateState.status !== 'needed') return;
    activatePresetTemplate(selectedPresetTemplate, { applyPreset: false });
  }, [selectedPresetTemplate, templateLinked, templateState.status]);
  useEffect(() => {
    if (activeTab !== 'popular') return undefined;
    let ignored = false;
    popularClient.loadHeroes().then((heroes) => {
      if (!ignored) {
        setPopularHeroes(heroes);
        setPopularHeroError('');
      }
    }).catch((error) => {
      if (!ignored) {
        const reason = `Hero list unavailable: ${error?.message || String(error)}`;
        setPopularHeroError(reason);
        setStatus(reason);
      }
    });
    return () => { ignored = true; };
  }, [activeTab, popularClient]);

  useEffect(() => {
    if (activeTab !== 'popular') return undefined;
    setPopularState({ heroId: popularHeroId, status: 'loading', data: null, error: '' });
    popularRequest.load(popularHeroId, (data) => {
      setPopularState({ heroId: popularHeroId, status: 'ready', data, error: '' });
    }, (error) => {
      const reason = error?.message || String(error);
      setPopularState({ heroId: popularHeroId, status: 'error', data: null, error: reason });
      setStatus(`Popularity data unavailable: ${reason}`);
    });
    return () => popularRequest.cancel();
  }, [activeTab, popularHeroId, popularRequest]);

  useEffect(() => {
    if (!selectionStorageReady || !isScaleDebugEnabled()) return;
    const debugSelectionCategory = scaleDebugSelectionCategory();
    if (!debugSelectionCategory) return;
    const debugSelectedIds = SHOP_ITEM_IDS_BY_CATEGORY[debugSelectionCategory];
    setSelectedIds(new Set(debugSelectedIds));
    setActiveTab('selected');
    setStatus(`Scale debug selected ${debugSelectedIds.length} ${CATEGORY_LABELS[debugSelectionCategory]} items.`);
  }, [selectionStorageReady]);

  const currentPopularState = popularState.heroId === popularHeroId ? popularState : { status: 'loading', data: null, error: '' };
  const popularItems = useMemo(() => currentPopularState.data ? getPopularItems(currentPopularState.data.rows, DEADLOCK_ITEMS.filter((item) => supportedItemIds.has(item.id))) : [], [currentPopularState.data, supportedItemIds]);
  const visibleItems = useMemo(() => {
    if (activeTab === 'popular') return popularItems;
    const tabItems = DEADLOCK_ITEMS.filter((item) => {
      if (!supportedItemIds.has(item.id)) return false;
      if (activeTab === 'selected' && !selectedIds.has(item.id)) return false;
      if ((activeTab === 'weapon' || activeTab === 'vitality' || activeTab === 'spirit') && item.category !== activeTab) return false;
      return true;
    });
    return filterItems(tabItems, activeTab === 'all' ? activeFilterIds : [], query);
  }, [activeTab, query, activeFilterIds, selectedIds, supportedItemIds, popularItems]);

  const itemsByTier = useMemo(() => {
    const groups = createTierMap();
    const visibleIds = new Set(visibleItems.map((item) => item.id));
    for (const item of sortShopItems(DEADLOCK_ITEMS.filter((candidate) => candidate.category === activeTab))) {
      groups.get(item.tier).push(visibleIds.has(item.id) ? item : null);
    }
    return groups;
  }, [activeTab, visibleItems]);

  useEffect(() => {
    if (!isScaleDebugEnabled()) return;

    let isCancelled = false;
    const rafIds = [];
    const timeoutIds = [];
    const logSnapshot = (label) => {
      if (isCancelled) return;
      logScaleDebugMetrics(readScaleDebugMetrics({
        activeTab,
        selectedCount: selectedIds.size,
        visibleCount: visibleItems.length,
        label
      }));
    };

    const selectCategory = (category = activeTab === 'selected' ? 'weapon' : activeTab) => {
      if (!SHOP_CATEGORIES.includes(category)) throw new Error(`Unknown shop category for scale debug: ${category}`);
      const debugSelectedIds = SHOP_ITEM_IDS_BY_CATEGORY[category];
      setSelectedIds(new Set(debugSelectedIds));
      setActiveTab('selected');
      setStatus(`Scale debug selected ${debugSelectedIds.length} ${CATEGORY_LABELS[category]} items.`);
      return { category, selectedCount: debugSelectedIds.length, ids: [...debugSelectedIds] };
    };

    const debugSnapshot = () => {
      const metrics = readScaleDebugMetrics({
        activeTab,
        selectedCount: selectedIds.size,
        visibleCount: visibleItems.length,
        label: 'manual'
      });
      logScaleDebugMetrics(metrics);
      return metrics;
    };
    debugSnapshot.selectCategory = selectCategory;
    window.customPassiveScaleDebug = debugSnapshot;

    rafIds.push(window.requestAnimationFrame(() => {
      logSnapshot('commit+1raf');
      rafIds.push(window.requestAnimationFrame(() => logSnapshot('commit+2raf')));
    }));
    timeoutIds.push(window.setTimeout(() => logSnapshot('commit+160ms'), 160));

    return () => {
      isCancelled = true;
      for (const rafId of rafIds) window.cancelAnimationFrame(rafId);
      for (const timeoutId of timeoutIds) window.clearTimeout(timeoutId);
      if (window.customPassiveScaleDebug) delete window.customPassiveScaleDebug;
    };
  }, [activeTab, selectedIds.size, visibleItems.length]);

  function updateQuery(value) {
    setQuery(value);
  }

  function selectFilter(id, additive) {
    clearPredictedHover();
    setActiveFilterIds((current) => additive ? [...new Set([...current, id])] : [id]);
  }

  function changePopularHero(heroId) {
    if (heroId === popularHeroId) return;
    popularRequest.cancel();
    clearPredictedHover();
    setPopularHeroId(heroId);
  }

  function toggleItem(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetDefaults() {
    setSelectedIds(new Set(selectedPresetTemplate.presetItemIds));
    setStatus(`Reset to ${selectedPresetTemplate.label} preset (${selectedPresetTemplate.presetItemIds.length} selected).`);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setStatus('Cleared all passive selections.');
  }

  function selectVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of visibleItems) next.add(item.id);
      return next;
    });
    setStatus(`Selected ${visibleItems.length} visible item${visibleItems.length === 1 ? '' : 's'}.`);
  }

  function clearPredictedHover() {
    pointerSampleRef.current = null;
    setPredictedHoverItemId(null);
    setDirectHoverItemId(null);
  }

  function updatePredictedHover(event) {
    const previousPointer = pointerSampleRef.current;
    const nextPrediction = predictiveHoverState(event, previousPointer);
    const predictedItemId = shouldKeepLockedPrediction(event, previousPointer, nextPrediction, nextPrediction.itemId)
      ? previousPointer.itemId
      : nextPrediction.itemId;
    const lockUntil = nextHoverLockUntil(event, previousPointer, nextPrediction, predictedItemId);
    pointerSampleRef.current = pointerSampleFromEvent(event, nextPrediction, predictedItemId, lockUntil);
    setPredictedHoverItemId((current) => (current === predictedItemId ? current : predictedItemId));
    const directItemId = nextPrediction.isDirect ? predictedItemId : null;
    setDirectHoverItemId((current) => (current === directItemId ? current : directItemId));
  }

  function changePresetTemplate(nextPresetTemplateId) {
    try {
      const preset = getPresetTemplate(nextPresetTemplateId);
      setPresetTemplateId(nextPresetTemplateId);
      if (templateLinked) {
        activatePresetTemplate(preset);
      } else {
        setTemplateState({ status: 'needed', bytes: null, offsets: null });
        setTemplateGateOpen(true);
        setStatus(`Template mode changed to ${preset.label}. Upload ${REQUIRED_GAMEBANANA_TEMPLATE.fileName} to continue.`);
      }
    } catch (error) {
      setStatus(error?.message || String(error));
    }
  }

  async function activatePresetTemplate(preset, options = {}) {
    const shouldApplyPreset = options.applyPreset !== false;
    setTemplateState({ status: 'ready', bytes: null, offsets: null, presetTemplateId: preset.id });
    if (shouldApplyPreset) setSelectedIds(new Set(preset.presetItemIds));
    changeTab('selected');
    setTemplateGateOpen(false);
    setStatus(shouldApplyPreset
      ? `Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${preset.label} mode preselected ${preset.presetItemIds.length} item${preset.presetItemIds.length === 1 ? '' : 's'} from ${preset.sourceArchive.fileName}. Template downloads when you build.`
      : `Verified saved ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${preset.label} mode ready. Template downloads when you build.`);
    return true;
  }

  async function loadCurrentBuildTemplate() {
    if (templateState.status === 'ready' && templateState.bytes && templateState.offsets && templateState.presetTemplateId === selectedPresetTemplate.id) {
      return templateState;
    }
    setStatus(`Loading ${selectedPresetTemplate.label} build template...`);
    const bytes = await loadTemplateBytes({
      templatePath: selectedPresetTemplate.templatePath,
      templateSha256: selectedPresetTemplate.templateSha256,
      label: selectedPresetTemplate.label
    });
    const parsed = readPassiveFlagTemplate(bytes, VALID_ITEM_IDS);
    assertCompletePassiveFlagOffsets(parsed.offsets, VALID_ITEM_IDS);
    const nextTemplateState = { status: 'ready', bytes, offsets: parsed.offsets, presetTemplateId: selectedPresetTemplate.id };
    setTemplateState(nextTemplateState);
    return nextTemplateState;
  }

  async function linkTemplateFile(file) {
    if (!file) return;
    setStatus(`Checking ${file.name || 'template'} SHA-256...`);
    try {
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const fileSha256 = await sha256Hex(fileBytes);
      if (!isRequiredTemplateSha256(fileSha256)) {
        throw new Error(`Template SHA-256 ${fileSha256} does not match ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}.`);
      }
      const didActivate = await activatePresetTemplate(selectedPresetTemplate);
      if (!didActivate) return;
      storeTemplateVerification();
      setTemplateLinked(true);
    } catch (error) {
      setTemplateLinked(false);
      setTemplateState({ status: 'error', bytes: null, offsets: null });
      setTemplateGateOpen(true);
      setStatus(error?.message || String(error));
    }
  }

  function changeTab(tabId) {
    if (tabId !== 'popular') popularRequest.cancel();
    if (tabId === 'popular' && activeTab !== 'popular') {
      setPopularState({ heroId: popularHeroId, status: 'loading', data: null, error: '' });
      setPopularHeroError('');
    }
    setActiveTab(tabId);
    clearPredictedHover();
    if (tabId !== 'all') {
      setQuery('');
      setActiveFilterIds([]);
    }
  }

  async function buildAndDownload(selectedItemIds) {
    if (templateState.status !== 'ready') {
      setStatus(`Upload ${REQUIRED_GAMEBANANA_TEMPLATE.fileName} before building.`);
      return;
    }
    setStatus(`Preparing ${selectedPresetTemplate.archiveOutputFileName}...`);
    try {
      const [buildTemplate, { writeVpk }, { writeSevenZipArchive }] = await Promise.all([
        loadCurrentBuildTemplate(),
        import('../lib/vpkWriter.js'),
        import('../lib/archiveWriter.js')
      ]);
      setStatus(`Building ${selectedPresetTemplate.archiveOutputFileName}...`);
      const { files, selectedItemIds: builtItemIds } = await buildCompressedCustomPassivePackage({
        templateBytes: buildTemplate.bytes,
        selectedItemIds,
        offsets: buildTemplate.offsets
      });
      const pak = writeVpk(files);
      const archive = await writeSevenZipArchive({
        archiveFileName: selectedPresetTemplate.archiveOutputFileName,
        memberFileName: selectedPresetTemplate.outputFileName,
        memberBytes: pak
      });
      downloadBytes(selectedPresetTemplate.archiveOutputFileName, archive);
      setStatus(`Built ${selectedPresetTemplate.archiveOutputFileName} from ${selectedPresetTemplate.label}; extract ${selectedPresetTemplate.outputFileName} into addons (${builtItemIds.length} selected, ${archive.byteLength.toLocaleString()} bytes).`);
    } catch (error) {
      setStatus(error?.message || String(error));
    }
  }

  async function performBuild() {
    await buildAndDownload([...selectedIds]);
  }

  const isCategoryTab = SHOP_BG_TABS.has(activeTab);
  const catalogBackground = isCategoryTab ? activeTab : 'generic';
  const relatedHoverIds = useMemo(() => RELATED_ITEM_IDS_BY_ID.get(predictedHoverItemId) || new Set(), [predictedHoverItemId]);
  const isTemplateReady = templateState.status === 'ready' && !templateGateOpen;
  useEffect(() => {
    if (isTemplateReady) return;
    clearPredictedHover();
  }, [isTemplateReady]);
  return (
    <ShopShell hoveringItem={isTemplateReady && Boolean(directHoverItemId)} onMouseMove={isTemplateReady ? updatePredictedHover : undefined} onMouseLeave={clearPredictedHover}>
      {templateGateOpen && (
        <TemplateGate
          presetTemplateId={presetTemplateId}
          selectedPresetTemplate={selectedPresetTemplate}
          onPresetTemplateChange={changePresetTemplate}
          onTemplateFile={linkTemplateFile}
          status={status}
        />
      )}
      <BuildDownloadPanel
        selectedCount={selectedIds.size}
        visibleCount={visibleItems.length}
        presetTemplateId={presetTemplateId}
        selectedPresetTemplate={selectedPresetTemplate}
        templateReady={isTemplateReady}
        onPresetTemplateChange={changePresetTemplate}
        onReset={resetDefaults}
        onClear={clearSelection}
        onSelectVisible={selectVisible}
        onBuild={performBuild}
        status={status}
      />
      <section class="catalog-shell" aria-label="Item catalog">
        <ShopTabs activeTab={activeTab} onTabChange={changeTab} />
        <div class={`catalog-content ${isCategoryTab ? '' : 'catalog-content-list'}`}>
          {isCategoryTab ? (
            <div key={`board-${catalogBackground}`} class={`catalog-board catalog-board-${catalogBackground}`} style={{ ...CATEGORY_BOARD_STYLE, '--catalog-bg': `url("${SHOP_BACKGROUNDS[catalogBackground]}")` }}>
              <div class="tiers">
                {[1, 2, 3, 4].map((tier) => (
                  <TierSection key={tier} category={catalogBackground} tier={tier} slots={itemsByTier.get(tier)} selectedIds={selectedIds} predictedHoverItemId={predictedHoverItemId} relatedHoverIds={relatedHoverIds} onToggle={toggleItem} />
                ))}
              </div>
            </div>
          ) : (
            <TierBoard key={`list-${activeTab}`} activeTab={activeTab} items={visibleItems} query={query} onQueryChange={updateQuery} filters={{ activeIds: activeFilterIds, onSelect: selectFilter, onRemove: (id) => setActiveFilterIds((current) => current.filter((value) => value !== id)), onClear: () => setActiveFilterIds([]) }} popular={{ heroId: popularHeroId, heroes: popularHeroes, onHeroChange: changePopularHero, data: currentPopularState.data, error: currentPopularState.error || popularHeroError, emptyMessage: currentPopularState.status === 'loading' ? 'Loading popularity data…' : currentPopularState.status === 'error' ? 'Popularity data unavailable' : 'No popularity data for this hero yet' }} selectedIds={selectedIds} predictedHoverItemId={predictedHoverItemId} relatedHoverIds={relatedHoverIds} onToggle={toggleItem} />
          )}
        </div>
        <CatalogSupportFooter />
      </section>
    </ShopShell>
  );
}
