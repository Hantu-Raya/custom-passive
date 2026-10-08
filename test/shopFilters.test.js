import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { deriveShopFilters, parseShopFilterRecord } from '../scripts/lib/shopFilters.mjs';

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
