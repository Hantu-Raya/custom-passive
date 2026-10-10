import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { deriveShopFilters, parseShopFilterRecord } from '../scripts/lib/shopFilters.mjs';
import { SHOP_FILTER_TREE, SHOP_FILTER_UI } from '../src/data/shopFilters.generated.js';
import { SHOP_LAYOUT } from '../src/data/shopLayout.generated.js';
import { filterItems, flattenFilters } from '../src/lib/shopFilterSelection.js';

const oracle = JSON.parse(readFileSync(new URL('./fixtures/shop-filter-oracle.json', import.meta.url), 'utf8'));
const GROUP_CHILDREN = Object.freeze({
  'Physical/Gun Improvements': ['Physical/Weapon Damage', 'Physical/Fire Rate', 'Physical/Ammo', 'Physical/Bullet Velocity', 'Physical/Range'],
  'Spirit/Ability Improvements': ['Spirit/Spirit Power', 'Spirit/Cooldown & Charges', 'Spirit/Duration', 'Spirit/Range'],
  'Spirit/Additional Damage': ['Spirit/Spirit Damage', 'Spirit/Health % Damage'],
  'Defense/Health': ['Defense/HP', 'Defense/Regen', 'Defense/Out of Combat Regen', 'Defense/Barrier', 'Defense/Healing', 'Defense/Lifesteal'],
  'Defense/Resistances': ['Defense/Physical Resistance', 'Defense/Spirit Resistance', 'Defense/Melee Resistance', 'Defense/Debuff Resistance', 'Defense/Slow Resistance'],
  'Mobility/Movement': ['Mobility/Move Speed', 'Mobility/Sprint', 'Mobility/Stamina', 'Mobility/Jump/Dash/Slide'],
  'Disruption/Reductions': ['Disruption/Bullet Damage Reduction', 'Disruption/Fire Rate Reduction', 'Disruption/Spirit Damage Reduction', 'Disruption/Slow'],
  'Disruption/Gun Reductions': ['Disruption/Bullet Damage Reduction', 'Disruption/Fire Rate Reduction'],
  'Disruption/Status Effects': ['Disruption/Stun', 'Disruption/Immobilize', 'Disruption/Disarm', 'Disruption/Silence', 'Disruption/Curse']
});

function idsMatching(keys) {
  return DEADLOCK_ITEMS.filter((item) => keys.some((key) => item.shopFilters.includes(key))).map((item) => item.id).sort();
}

test('filter metadata contains only unique, sorted oracle leaves', () => {
  assert.equal(oracle.client_version, 6763);
  assert.equal(Object.keys(oracle.filters).length, 55);
  const leaves = new Set(Object.keys(oracle.filters).filter((key) => !GROUP_CHILDREN[key]));
  for (const item of DEADLOCK_ITEMS) {
    assert.ok(Array.isArray(item.shopFilters), item.id);
    assert.deepEqual(item.shopFilters, [...new Set(item.shopFilters)].sort(), item.id);
    for (const filter of item.shopFilters) assert.ok(leaves.has(filter), `${item.id}: ${filter}`);
  }
});

for (const [key, expected] of Object.entries(oracle.filters)) {
  test(`shop filter matches client 6763: ${key}`, () => {
    assert.deepEqual(idsMatching(GROUP_CHILDREN[key] || [key]), [...expected].sort());
  });
}

test('Weapon Damage OR HP matches the captured 71-item union', () => {
  const expected = [...new Set([...oracle.filters['Physical/Weapon Damage'], ...oracle.filters['Defense/HP']])].sort();
  const combination = idsMatching(['Physical/Weapon Damage', 'Defense/HP']);
  assert.deepEqual(combination, expected);
  assert.equal(combination.length, 71);
  assert.deepEqual(oracle.combo_checked['Physical/Weapon Damage OR Defense/HP'], { count: 71, equals_union: true });
});

test('generated stock filter tree preserves category, group and leaf order with frozen localized metadata', () => {
  assert.deepEqual(SHOP_FILTER_TREE.map((node) => node.id), ['Physical', 'Spirit', 'Defense', 'Mobility', 'Disruption', 'Misc']);
  const nodes = flattenFilters();
  const options = nodes.filter((node) => node.id.includes('/'));
  assert.deepEqual(options.map((node) => node.id).sort(), Object.keys(oracle.filters).sort());
  const leaves = new Set(nodes.filter((node) => !node.children).map((node) => node.id));
  assert.deepEqual([...leaves].sort(), Object.keys(oracle.filters).filter((id) => !GROUP_CHILDREN[id]).sort());
  assert.deepEqual(SHOP_FILTER_TREE[0].children[0].children.map((node) => node.id), ['Physical/Weapon Damage', 'Physical/Ammo', 'Physical/Fire Rate', 'Physical/Bullet Velocity', 'Physical/Range']);
  assert.ok(Object.isFrozen(SHOP_FILTER_TREE));
  assert.ok(Object.isFrozen(SHOP_FILTER_UI));
  assert.equal(SHOP_FILTER_UI.helpLines.length, 2);
  assert.equal(SHOP_FILTER_UI.provenance.clientVersion, SHOP_LAYOUT.provenance.clientVersion);
  assert.ok(SHOP_FILTER_UI.provenance.clientVersion >= oracle.client_version);
  for (const node of nodes) {
    assert.ok(Object.isFrozen(node), node.id);
    if (node.children) assert.ok(Object.isFrozen(node.children), node.id);
    assert.ok(node.label && node.token && node.stockId, node.id);
    assert.match(node.iconUrl, /^assets\/deadlock\/panorama\/images\/.+\.(?:webp|svg)$/, node.id);
  }
  for (const item of DEADLOCK_ITEMS) for (const id of item.shopFilters) assert.ok(leaves.has(id), `${item.id}: ${id}`);
  for (const [id, expected] of Object.entries(oracle.filters)) {
    assert.deepEqual(filterItems(DEADLOCK_ITEMS, [id], '').map((item) => item.id).sort(), [...expected].sort(), id);
  }
});

test('filterItems selects literal Physical/Ammo ids and preserves input order', () => {
  const expected = ['upgrade_active_reload', 'upgrade_clip_size', 'upgrade_critshot', 'upgrade_enchanted_holsters', 'upgrade_ethereal_bullets', 'upgrade_intensifying_clip', 'upgrade_kinetic_sash', 'upgrade_quick_silver', 'upgrade_rechargingbullets', 'upgrade_reinforcing_casings', 'upgrade_titan_round'];
  const result = filterItems(DEADLOCK_ITEMS, ['Physical/Ammo'], '');
  assert.deepEqual(result.map((item) => item.id).sort(), expected);
  assert.deepEqual(result, DEADLOCK_ITEMS.filter((item) => expected.includes(item.id)));
  const reversed = [...DEADLOCK_ITEMS].reverse();
  assert.deepEqual(filterItems(reversed, new Set(['Physical/Ammo']), ''), [...result].reverse());
});

test('filterItems expands the literal Gun Improvements group into its leaf union', () => {
  const expected = ['upgrade_active_reload', 'upgrade_aprounds', 'upgrade_berserker', 'upgrade_blitz_bullets', 'upgrade_blood_tribute', 'upgrade_bullet_resist_shredder', 'upgrade_bulletshredimbue', 'upgrade_burst_fire', 'upgrade_capacitor', 'upgrade_clip_size', 'upgrade_cloaking_device_active', 'upgrade_close_quarter_combat', 'upgrade_close_range', 'upgrade_colossus', 'upgrade_critshot', 'upgrade_damage_recycler', 'upgrade_dps_aura', 'upgrade_enchanted_holsters', 'upgrade_ethereal_bullets', 'upgrade_express_shot', 'upgrade_fervor', 'upgrade_fleetfoot_boots', 'upgrade_focus_lens', 'upgrade_fury_trance', 'upgrade_glass_cannon', 'upgrade_headhunter', 'upgrade_healbuff', 'upgrade_high_velocity_mag', 'upgrade_hollow_point_rounds', 'upgrade_inhibitor', 'upgrade_intensifying_clip', 'upgrade_kinetic_sash', 'upgrade_long_range', 'upgrade_magic_storm', 'upgrade_medic_bullets', 'upgrade_non_player_bonus', 'upgrade_non_player_bonus_sacrifice', 'upgrade_phantom_strike', 'upgrade_pristine_emblem', 'upgrade_quick_silver', 'upgrade_rapid_rounds', 'upgrade_rechargingbullets', 'upgrade_regenerating_bullet_shield', 'upgrade_reinforcing_casings', 'upgrade_ricochet', 'upgrade_sharpshooter', 'upgrade_siphon_bullets', 'upgrade_split_shot', 'upgrade_surging_power', 'upgrade_tech_overflow', 'upgrade_titan_round', 'upgrade_vampire', 'upgrade_weighted_shots'];
  assert.deepEqual(filterItems(DEADLOCK_ITEMS, ['Physical/Gun Improvements'], '').map((item) => item.id).sort(), expected);
  const categoryResult = filterItems(DEADLOCK_ITEMS, ['Physical'], '');
  assert.deepEqual(categoryResult, DEADLOCK_ITEMS.filter((item) => item.shopFilters.some((id) => id.startsWith('Physical/'))));
});

test('filterItems ORs Weapon Damage and HP into the literal 71-id oracle union', () => {
  const expected = ['upgrade_aprounds', 'upgrade_banshee_slugs', 'upgrade_berserker', 'upgrade_boundless_spirit', 'upgrade_boxing_glove', 'upgrade_bullet_armor_reduction_aura', 'upgrade_bullet_resist_shredder', 'upgrade_bulletshredimbue', 'upgrade_cheat_death', 'upgrade_chonky', 'upgrade_clip_size', 'upgrade_close_quarter_combat', 'upgrade_close_range', 'upgrade_colossus', 'upgrade_counterspell', 'upgrade_damage_recycler', 'upgrade_debuff_reducer', 'upgrade_deflecting_armor', 'upgrade_discord', 'upgrade_express_shot', 'upgrade_fervor', 'upgrade_fleetfoot_boots', 'upgrade_fury_trance', 'upgrade_glass_cannon', 'upgrade_greater_withering_whip', 'upgrade_headhunter', 'upgrade_headshot_booster', 'upgrade_headshot_booster2', 'upgrade_health', 'upgrade_health_stealing_magic', 'upgrade_high_velocity_mag', 'upgrade_hollow_point_rounds', 'upgrade_infuser', 'upgrade_inhibitor', 'upgrade_intensifying_clip', 'upgrade_long_range', 'upgrade_magic_carpet', 'upgrade_magic_shock', 'upgrade_magic_slow', 'upgrade_medic_bullets', 'upgrade_melee_rebuttal', 'upgrade_mystic_regeneration', 'upgrade_non_player_bonus', 'upgrade_non_player_bonus_sacrifice', 'upgrade_phantom_strike', 'upgrade_pristine_emblem', 'upgrade_rechargingbullets', 'upgrade_regenerating_bullet_shield', 'upgrade_reinforcing_casings', 'upgrade_resonant_healing', 'upgrade_rupture', 'upgrade_sharpshooter', 'upgrade_siphon_bullets', 'upgrade_spellbreaker', 'upgrade_spellslinger_headshots', 'upgrade_spirit_sap', 'upgrade_spirit_snatch', 'upgrade_split_shot', 'upgrade_surging_power', 'upgrade_target_stun', 'upgrade_targeted_silence', 'upgrade_tech_damage_pulse', 'upgrade_tech_overflow', 'upgrade_titan_round', 'upgrade_ultimate_burst', 'upgrade_unstoppable', 'upgrade_vampire', 'upgrade_veil_walker', 'upgrade_weapon_backstabber', 'upgrade_weighted_shots', 'upgrade_withering_whip'];
  assert.equal(expected.length, 71);
  assert.deepEqual(filterItems(DEADLOCK_ITEMS, ['Physical/Weapon Damage', 'Defense/HP'], '').map((item) => item.id).sort(), expected);
  assert.deepEqual(filterItems(DEADLOCK_ITEMS, ['Defense/HP', 'Physical/Weapon Damage', 'Defense/HP'], '').map((item) => item.id).sort(), expected);
});

test('filterItems intersects the existing search predicate and handles empty and unknown filters', () => {
  assert.deepEqual(filterItems(DEADLOCK_ITEMS, ['Physical/Weapon Damage'], '  LIFESTEAL ').map((item) => item.id), ['upgrade_vampire']);
  const searchResult = filterItems(DEADLOCK_ITEMS, [], 'lifesteal');
  assert.deepEqual(searchResult, DEADLOCK_ITEMS.filter((item) => `${item.id} ${item.label} ${item.description} ${item.category} tier ${item.tier}`.toLowerCase().includes('lifesteal')));
  assert.deepEqual(filterItems(DEADLOCK_ITEMS, [], ''), DEADLOCK_ITEMS);
  assert.deepEqual(filterItems(DEADLOCK_ITEMS, ['not-a-stock-filter'], ''), []);
});

test('VData inheritance merges property metadata, replaces arrays, and applies exclusions last', () => {
  const base = parseShopFilterRecord(`{
    m_mapAbilityProperties = {
      Damage = { m_strValue = "10" m_eProvidedPropertyType = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE" }
      Health = { m_strValue = "75" m_eProvidedPropertyType = "MODIFIER_VALUE_HEALTH_MAX" }
    }
    m_vecTooltipSectionInfo = [{ m_vecAbilityProperties = ["Damage", "Health"] }]
    m_eAdditionalShopFilters = "EShopFilterAntiCC"
  }`);
  const record = parseShopFilterRecord(`{
    _multibase = ["base"]
    m_mapAbilityProperties = { Damage = { m_strValue = "25" } }
    m_vecTooltipSectionInfo = [{ m_vecElevatedAbilityProperties = ["Damage"] }]
    m_eDisableShopFilters = "EShopFilterWeaponDamage"
    m_strAbilityImage = panorama:"file://{images}/items/weapon/example.psd"
  }`);
  const before = JSON.stringify(base);
  assert.equal(record.m_strAbilityImage, 'file://{images}/items/weapon/example.psd');
  assert.deepEqual(deriveShopFilters(record, { records: new Map([['base', base]]) }), ['Defense/Anti-CC']);
  assert.equal(JSON.stringify(base), before);
  for (const field of ['_base', 'm_strBase']) {
    assert.deepEqual(deriveShopFilters({ [field]: 'base' }, { records: new Map([['base', base]]) }), ['Defense/Anti-CC', 'Defense/HP', 'Physical/Weapon Damage']);
  }
});

test('visible negative stats distinguish enemy reductions from self-penalties', () => {
  const record = {
    m_mapAbilityProperties: {
      Reduction: { m_strValue: '-30', m_eProvidedPropertyType: 'MODIFIER_VALUE_TECH_POWER' },
      SelfPenalty: { m_strValue: '-60', m_eProvidedPropertyType: 'MODIFIER_VALUE_HEAL_AMP_RECEIVE_PERCENT', m_bIsNegativeAttribute: 'true' },
      Reload: { m_strValue: '-10', m_eProvidedPropertyType: 'MODIFIER_VALUE_RELOAD_SPEED' },
      UnlistedHealth: { m_strValue: '75', m_eProvidedPropertyType: 'MODIFIER_VALUE_HEALTH_MAX' },
      ZeroSprint: { m_strValue: '0m', m_eProvidedPropertyType: 'MODIFIER_VALUE_SPRINT_SPEED_BONUS' }
    },
    m_vecTooltipSectionInfo: [{ m_vecAbilityProperties: ['Reduction', 'SelfPenalty', 'Reload', 'ZeroSprint'] }]
  };
  assert.deepEqual(deriveShopFilters(record, { records: new Map() }), ['Disruption/Spirit Damage Reduction', 'Physical/Ammo']);
});

test('tooltip status, scale-stat filters, activation, and imbue flags add leaf memberships', () => {
  const record = {
    m_mapAbilityProperties: { ScalingStat: { m_strValue: '1', m_eScaleStatFilter: 'ETechPower' } },
    m_vecTooltipSectionInfo: [{ m_vecImportantAbilityProperties: [{ m_strImportantProperty: 'StatusEffectEMP' }], m_vecAbilityProperties: ['ScalingStat'] }],
    m_eAbilityActivation: 'CITADEL_ABILITY_ACTIVATION_INSTANT_CAST',
    m_TargetAbilityEffectsToApply: 'CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE_ACTIVE_NON_ULT',
    m_eAdditionalShopFilters: 'EShopFilterAntiCC | EShopFilterAntiCC'
  };
  assert.deepEqual(deriveShopFilters(record, { records: new Map() }), ['Defense/Anti-CC', 'Disruption/Silence', 'Misc/Active Items', 'Misc/Imbue Items', 'Spirit/Spirit Power']);
});

test('invalid VData and unresolved inheritance fail instead of silently dropping filters', () => {
  assert.throws(() => parseShopFilterRecord('{ MissingAssignment "10" }'), /Expected VData assignment/);
  assert.throws(() => parseShopFilterRecord('{ Values = ['), /Unclosed VData array/);
  assert.throws(() => deriveShopFilters({ _base: 'missing' }, { records: new Map() }), /Missing VData base/);
  assert.throws(() => deriveShopFilters({ _base: 'cycle' }, { records: new Map([['cycle', { _base: 'cycle' }]]) }), /Cyclic VData inheritance/);
});
