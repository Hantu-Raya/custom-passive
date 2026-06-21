import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEADLOCK_ITEMS, TIER_COSTS } from '../data/deadlockItems.generated.js';
import { downloadBytes } from '../lib/download.js';
import { buildCompressedCustomPassivePackage, loadTemplateBytes, sha256Hex } from '../lib/packageBuilder.js';
import { assertCompletePassiveFlagOffsets, readPassiveFlagTemplate } from '../lib/source2PassiveFlags.js';
import { PRESET_TEMPLATE_IDS, PRESET_TEMPLATES, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../lib/presetTemplates.js';

const STORAGE_KEY = 'custom-passive:selected-items:v2';
const TEMPLATE_VERIFICATION_STORAGE_KEY = 'custom-passive:template-verification:v1';
const TEMPLATE_VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;
const SHOP_IMAGE_BASE = `${import.meta.env.BASE_URL}assets/deadlock/panorama/images/shop/`;
const SHOP_ASSET_BASE = `${SHOP_IMAGE_BASE}catalog/`;
const TAB_ICONS = Object.freeze({
  selected: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_builds_psd.webp`,
  weapon: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_weapon_psd.webp`,
  vitality: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_vitality_psd.webp`,
  spirit: `${SHOP_ASSET_BASE}catalog_shop_tab_icon_spirit_psd.webp`,
  search: `${SHOP_ASSET_BASE}catalog_shop_tab_search_showing_sm_psd.webp`
});
const SHOP_BG_TABS = new Set(['weapon', 'vitality', 'spirit']);
const SHOP_BACKGROUNDS = Object.freeze({
  generic: `${SHOP_ASSET_BASE}catalog_shop_generic_bg_psd.webp`,
  selected: `${SHOP_ASSET_BASE}catalog_shop_builds_bg_psd.webp`,
  weapon: `${SHOP_ASSET_BASE}catalog_shop_bg_weapon_psd.webp`,
  vitality: `${SHOP_ASSET_BASE}catalog_shop_bg_vitality_psd.webp`,
  spirit: `${SHOP_ASSET_BASE}catalog_shop_bg_spirit_psd.webp`
});
const SHOP_ICON_URLS = Object.freeze([...new Set(DEADLOCK_ITEMS.map((item) => item.iconUrl).filter(Boolean))].map((path) => `${import.meta.env.BASE_URL}${path}`));
const SHOP_CARD_ASSET_BASE = `${SHOP_ASSET_BASE}cards/`;
const SHOP_TOOLTIP_STAR = `${SHOP_ASSET_BASE}backer_star_test_png.webp`;
const TABS = Object.freeze([
  { id: 'selected', label: 'Selected' },
  { id: 'weapon', label: 'Weapon' },
  { id: 'vitality', label: 'Vitality' },
  { id: 'spirit', label: 'Spirit' },
  { id: 'search', label: 'Search' }
]);
const CATEGORY_GLYPHS = Object.freeze({ weapon: '✦', vitality: '✚', spirit: '⬡' });
const SHOP_CATEGORIES = Object.freeze(['weapon', 'vitality', 'spirit']);
const SHOP_ITEM_IDS_BY_CATEGORY = Object.freeze(Object.fromEntries(
  SHOP_CATEGORIES.map((category) => [
    category,
    Object.freeze(DEADLOCK_ITEMS.filter((item) => item.category === category).map((item) => item.id))
  ])
));
const CATEGORY_LABELS = Object.freeze({ selected: 'Selected', weapon: 'Weapon', vitality: 'Vitality', spirit: 'Spirit', search: 'Search all' });
const TIER_COLUMNS = Object.freeze({
  generic: { 1: 5, 2: 6, 3: 7, 4: 4 },
  weapon: { 1: 5, 2: 6, 3: 7, 4: 4 },
  vitality: { 1: 5, 2: 6, 3: 5, 4: 6 },
  spirit: { 1: 5, 2: 6, 3: 5, 4: 6 }
});
const WEAPON_GUIDE_BOXES = Object.freeze({
  1: Object.freeze({ left: 4.6, top: 20.0, width: 40.2, height: 27.9 }),
  2: Object.freeze({ left: 48.5, top: 6.5, width: 47.2, height: 41.6 }),
  3: Object.freeze({ left: 4.6, top: 55.7, width: 54.8, height: 42.9 }),
  4: Object.freeze({ left: 63.6, top: 55.6, width: 31.8, height: 46.9 })
});
const VITALITY_GUIDE_BOXES = Object.freeze({
  1: Object.freeze({ left: 4.6, top: 19.5, width: 39.8, height: 28.9 }),
  2: Object.freeze({ left: 48.8, top: 6.4, width: 47.4, height: 44.0 }),
  3: Object.freeze({ left: 5.2, top: 55.4, width: 40.4, height: 41.8 }),
  4: Object.freeze({ left: 48.8, top: 55.4, width: 47.5, height: 41.8 })
});
const SPIRIT_GUIDE_BOXES = Object.freeze({
  1: Object.freeze({ left: 4.8, top: 19.5, width: 41.7, height: 28.0 }),
  2: Object.freeze({ left: 48.8, top: 5.9, width: 47.4, height: 40.9 }),
  3: Object.freeze({ left: 4.9, top: 55.5, width: 39.5, height: 41.6 }),
  4: Object.freeze({ left: 48.8, top: 55.4, width: 47.8, height: 41.9 })
});
const DEFAULT_GUIDE_BOXES = Object.freeze({
  generic: WEAPON_GUIDE_BOXES,
  weapon: WEAPON_GUIDE_BOXES,
  vitality: VITALITY_GUIDE_BOXES,
  spirit: SPIRIT_GUIDE_BOXES
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
  const compact = words.length >= 3 || label.length >= 15 || maxWordLength >= 9;
  const dense = words.length >= 4 || label.length >= 22 || maxWordLength >= 12;
  return [compact ? 'item-card-name-compact' : '', dense ? 'item-card-name-dense' : ''].filter(Boolean).join(' ');
}

function searchableText(item) {
  return `${item.id} ${item.label} ${item.description} ${item.category} tier ${item.tier}`.toLowerCase();
}

function stripMarkup(text) {
  return text.replace(/<[^>]*>/g, ' ').replace(/\{[^}]+}/g, '').replace(/\s+/g, ' ').trim();
}

function sortListItems(items) {
  const categoryRank = new Map(SHOP_CATEGORIES.map((category, index) => [category, index]));
  return [...items].sort((a, b) => (
    a.tier - b.tier
    || (categoryRank.get(a.category) ?? 99) - (categoryRank.get(b.category) ?? 99)
    || a.label.localeCompare(b.label)
  ));
}

function sortShopItems(items) {
  return [...items].sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

function createTierMap() {
  return new Map([1, 2, 3, 4].map((tier) => [tier, []]));
}

function defaultGuideBoxesFor(category) {
  return DEFAULT_GUIDE_BOXES[category] || DEFAULT_GUIDE_BOXES.generic;
}

function guideBoxStyle(box) {
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`
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
    <nav class="shop-tabs" aria-label="Shop categories">
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
          {TAB_ICONS[tab.id].startsWith('/') ? <img src={TAB_ICONS[tab.id]} alt="" /> : <span aria-hidden="true">{TAB_ICONS[tab.id]}</span>}
          <em>{tab.label}</em>
        </button>
      ))}
    </nav>
  );
}

function SearchBox({ query, onQueryChange }) {
  return (
    <div class="catalog-search search-box" role="search">
      <label htmlFor="shop-search">Search items</label>
      <p class="search-hint">Try searching by Item Name or by stat such as Ammo, Lifesteal or Spirit Power</p>
      <div class="search-row">
        <input
          id="shop-search"
          data-testid="search-input"
          type="search"
          value={query}
          placeholder="Headshot, spirit, tier 2..."
          onInput={(event) => onQueryChange(event.currentTarget.value)}
        />
        <button type="button" data-testid="clear-search" onClick={() => onQueryChange('')} disabled={!query}>Clear</button>
      </div>
    </div>
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
          href={REQUIRED_GAMEBANANA_TEMPLATE.modUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open GameBanana page
        </a>
      </section>
      <div class="build-actions">
        <button type="button" data-testid="reset-defaults" onClick={onReset}>Reset selection</button>
        <button type="button" data-testid="clear-selection" onClick={onClear}>Clear all</button>
        <button type="button" onClick={onSelectVisible} disabled={visibleCount === 0}>Select visible</button>
        <button type="button" class="primary-build" data-testid="build-download" onClick={onBuild} disabled={!templateReady}>Build / download archive</button>
      </div>
      <p class="build-status" role="status">{status}</p>
      <footer class="page-footer" aria-label="Project notices">
        <p>
          Unofficial fan-made tool. Not affiliated with Valve. Runs locally; archives are not uploaded. Built by{' '}
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
        <p>The builder needs this one verified 06/18 GameBanana template archive before any VPK can be built.</p>
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
          href={REQUIRED_GAMEBANANA_TEMPLATE.modUrl}
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
          <em>Use only the 06/18 template archive from GameBanana</em>
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

function TierSection({ tier, columns, box, slots, selectedIds, predictedHoverItemId, relatedHoverIds, onToggle }) {
  const visibleCount = countVisibleSlots(slots);
  return (
    <section class="tier-section" aria-labelledby={`tier-${tier}`} style={{ '--tier-columns': columns, ...guideBoxStyle(box) }}>
      <div class="tier-heading">
        <h2 id={`tier-${tier}`}>${TIER_COSTS[tier].toLocaleString()} TIER {tier}</h2>
        <span>{visibleCount} item{visibleCount === 1 ? '' : 's'}</span>
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

function ListTierSection({ tier, slots, selectedIds, predictedHoverItemId, relatedHoverIds, onToggle }) {
  const visibleSlots = slots.filter(Boolean);
  if (visibleSlots.length === 0) return null;
  return (
    <section class="list-tier-section" aria-labelledby={`list-tier-${tier}`}>
      <h2 id={`list-tier-${tier}`}>Tier {tier}</h2>
      <div class="list-item-grid">
        {visibleSlots.map((item, index) => (
          <ItemCard key={item.id} item={item} index={index} selected={selectedIds.has(item.id)} predictedHover={predictedHoverItemId === item.id} relatedHover={relatedHoverIds.has(item.id)} onToggle={onToggle} />
        ))}
      </div>
    </section>
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
        <span class="item-cost">${item.cost.toLocaleString()}</span>
        <span class="item-tier">T{item.tier}</span>
        {selected && <span class="selected-star" aria-hidden="true">★</span>}
        {activationBadges.length > 0 && (
          <span class={`item-activation-badges ${activationBadges.length > 1 ? 'item-activation-badges-stacked' : ''}`}>
            {activationBadges.map((badge) => <span key={badge} class={`item-activation-badge item-activation-badge-${badge}`}>{badge.toUpperCase()}</span>)}
          </span>
        )}
        <span class="item-icon" aria-hidden="true">
          {item.iconUrl ? <img src={`${import.meta.env.BASE_URL}${item.iconUrl}`} alt="" loading="eager" decoding="async" /> : <span><b>{CATEGORY_GLYPHS[item.category]}</b><em>{itemInitials(item.label)}</em></span>}
        </span>
        <span class="item-name">{item.label}</span>
        <span class="item-state">{selected ? 'Selected passive' : 'Not selected'}</span>
      </button>
    </span>
  );
}

export default function CustomPassiveShop() {
  const [selectedIds, setSelectedIds] = useState(createDefaultSelection);
  const [selectionStorageReady, setSelectionStorageReady] = useState(false);
  const [activeTab, setActiveTab] = useState('selected');
  const [query, setQuery] = useState('');
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
    if (!selectionStorageReady || !isScaleDebugEnabled()) return;
    const debugSelectionCategory = scaleDebugSelectionCategory();
    if (!debugSelectionCategory) return;
    const debugSelectedIds = SHOP_ITEM_IDS_BY_CATEGORY[debugSelectionCategory];
    setSelectedIds(new Set(debugSelectedIds));
    setActiveTab('selected');
    setStatus(`Scale debug selected ${debugSelectedIds.length} ${CATEGORY_LABELS[debugSelectionCategory]} items.`);
  }, [selectionStorageReady]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    return DEADLOCK_ITEMS.filter((item) => {
      if (!supportedItemIds.has(item.id)) return false;
      if (activeTab === 'selected' && !selectedIds.has(item.id)) return false;
      if ((activeTab === 'weapon' || activeTab === 'vitality' || activeTab === 'spirit') && item.category !== activeTab) return false;
      if (normalizedQuery && !searchableText(item).includes(normalizedQuery)) return false;
      return true;
    });
  }, [activeTab, normalizedQuery, selectedIds, supportedItemIds]);

  const itemsByTier = useMemo(() => {
    const groups = createTierMap();
    if (SHOP_BG_TABS.has(activeTab)) {
      const visibleIds = new Set(visibleItems.map((item) => item.id));
      for (const item of sortShopItems(DEADLOCK_ITEMS.filter((candidate) => candidate.category === activeTab))) {
        groups.get(item.tier).push(visibleIds.has(item.id) ? item : null);
      }
      return groups;
    }
    for (const item of sortListItems(visibleItems)) groups.get(item.tier).push(item);
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
    setActiveTab('selected');
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
    setActiveTab(tabId);
    clearPredictedHover();
    if (tabId !== 'search') setQuery('');
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
  const tierColumns = TIER_COLUMNS[catalogBackground];
  const guideBoxes = useMemo(() => defaultGuideBoxesFor(catalogBackground), [catalogBackground]);
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
            <div key={`board-${catalogBackground}`} class={`catalog-board catalog-board-${catalogBackground}`} style={{ '--catalog-bg': `url("${SHOP_BACKGROUNDS[catalogBackground]}")` }}>
              <div class="tiers">
                {[1, 2, 3, 4].map((tier) => (
                  <TierSection key={tier} tier={tier} columns={tierColumns[tier]} box={guideBoxes[tier]} slots={itemsByTier.get(tier)} selectedIds={selectedIds} predictedHoverItemId={predictedHoverItemId} relatedHoverIds={relatedHoverIds} onToggle={toggleItem} />
                ))}
              </div>
            </div>
          ) : (
            <div key={`list-${activeTab}`} class={`catalog-list-board catalog-list-board-${activeTab}`} style={{ '--catalog-selected-bg': `url("${SHOP_BACKGROUNDS.selected}")` }}>
              {activeTab === 'search' && <SearchBox query={query} onQueryChange={updateQuery} />}
              <div class="list-tiers">
                {[1, 2, 3, 4].map((tier) => (
                  <ListTierSection key={tier} tier={tier} slots={itemsByTier.get(tier)} selectedIds={selectedIds} predictedHoverItemId={predictedHoverItemId} relatedHoverIds={relatedHoverIds} onToggle={toggleItem} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </ShopShell>
  );
}
