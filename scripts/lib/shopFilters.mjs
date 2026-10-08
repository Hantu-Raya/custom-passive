const FILTER_BY_ENUM = Object.freeze({
  EShopFilterWeaponDamage: 'Physical/Weapon Damage',
  EShopFilterWeaponFireRate: 'Physical/Fire Rate',
  EShopFilterWeaponAmmo: 'Physical/Ammo',
  EShopFilterWeaponBulletVelocity: 'Physical/Bullet Velocity',
  EShopFilterWeaponRange: 'Physical/Range',
  EShopFilterMelee: 'Physical/Melee',
  EShopFilterPhysicalAdditionalDamage: 'Physical/Additional Physical Damage',
  EShopFilterSpiritDamage: 'Spirit/Spirit Power',
  EShopFilterSpiritCooldownAndCharges: 'Spirit/Cooldown & Charges',
  EShopFilterSpiritDuration: 'Spirit/Duration',
  EShopFilterSpiritRange: 'Spirit/Range',
  EShopFilterSpiritAdditionalDamage: 'Spirit/Spirit Damage',
  EShopFilterSpiritAdditionalDamagePct: 'Spirit/Health % Damage',
  EShopFilterHP: 'Defense/HP',
  EShopFilterRegen: 'Defense/Regen',
  EShopFilterOutOfCombatRegen: 'Defense/Out of Combat Regen',
  EShopFilterBarrier: 'Defense/Barrier',
  EShopFilterHealing: 'Defense/Healing',
  EShopFilterLifesteal: 'Defense/Lifesteal',
  EShopFilterPhysicalResist: 'Defense/Physical Resistance',
  EShopFilterSpiritResist: 'Defense/Spirit Resistance',
  EShopFilterMeleeResist: 'Defense/Melee Resistance',
  EShopFilterDebuffResist: 'Defense/Debuff Resistance',
  EShopFilterSlowResist: 'Defense/Slow Resistance',
  EShopFilterAntiCC: 'Defense/Anti-CC',
  EShopFilterInvulnerability: 'Defense/Invulnerability',
  EShopFilterMoveSpeed: 'Mobility/Move Speed',
  EShopFilterSprint: 'Mobility/Sprint',
  EShopFilterStamina: 'Mobility/Stamina',
  EShopFilterJumpAndDash: 'Mobility/Jump/Dash/Slide',
  EShopFilterTeleport: 'Mobility/Teleport',
  EShopFilterStealth: 'Mobility/Stealth',
  EShopFilterAntiHeal: 'Disruption/Anti-Healing',
  EShopFilterBulletVuln: 'Disruption/Physical Vulnerability',
  EShopFilterSpiritVuln: 'Disruption/Spirit Vulnerability',
  EShopFilterBulletDamageReduction: 'Disruption/Bullet Damage Reduction',
  EShopFilterFireRateReduction: 'Disruption/Fire Rate Reduction',
  EShopFilterSpiritDamageReduction: 'Disruption/Spirit Damage Reduction',
  EShopFilterMobilityReduction: 'Disruption/Slow',
  EShopFilterStatus_Stun: 'Disruption/Stun',
  EShopFilterStatus_Immobilize: 'Disruption/Immobilize',
  EShopFilterStatus_Disarm: 'Disruption/Disarm',
  EShopFilterStatus_Silence: 'Disruption/Silence',
  EShopFilterStatus_Curse: 'Disruption/Curse',
  EShopFilterActive: 'Misc/Active Items',
  EShopFilterImbue: 'Misc/Imbue Items'
});

const FILTER_BY_PROPERTY = Object.freeze({
  WEAPON_DAMAGE_INCREASE: 'Physical/Weapon Damage',
  WEAPON_POWER: 'Physical/Weapon Damage',
  CLOSE_RANGE_WEAPON_DAMAGE_INCREASE: 'Physical/Weapon Damage',
  LONG_RANGE_BULLET_DAMAGE_INCREASE: 'Physical/Weapon Damage',
  WEAPON_DAMAGE_TO_NPC_INCREASE: 'Physical/Weapon Damage',
  FIRE_RATE: 'Physical/Fire Rate',
  AMMO_CLIP_SIZE: 'Physical/Ammo',
  AMMO_CLIP_SIZE_PERCENT: 'Physical/Ammo',
  RELOAD_SPEED: 'Physical/Ammo',
  BONUS_BULLET_SPEED_PERCENT: 'Physical/Bullet Velocity',
  BONUS_ATTACK_RANGE_PERCENT: 'Physical/Range',
  ZOOM_INCREASE_PERCENT: 'Physical/Range',
  BONUS_BULLET_DAMAGE_LONG_RANGE_MIN_RANGE: 'Physical/Range',
  BONUS_WEAPON_DAMAGE_CLOSE_RANGE_MAX_RANGE: 'Physical/Range',
  MELEE_DAMAGE_INCREASE: 'Physical/Melee',
  MELEE_TRAVEL_DISTANCE_PERCENTAGE: 'Physical/Melee',
  TECH_POWER: 'Spirit/Spirit Power',
  TECH_POWER_PERCENT: 'Spirit/Spirit Power',
  TECH_DAMAGE_MULTIPLIER: 'Spirit/Spirit Damage',
  COOLDOWN_REDUCTION_PERCENTAGE: 'Spirit/Cooldown & Charges',
  COOLDOWN_BETWEEN_CHARGE_REDUCTION_PERCENTAGE: 'Spirit/Cooldown & Charges',
  ITEM_COOLDOWN_REDUCTION_PERCENTAGE: 'Spirit/Cooldown & Charges',
  ULTIMATE_COOLDOWN_REDUCTION_PERCENTAGE: 'Spirit/Cooldown & Charges',
  BONUS_ABILITY_CHARGES: 'Spirit/Cooldown & Charges',
  BONUS_ABILITY_DURATION_PERCENTAGE: 'Spirit/Duration',
  TECH_RANGE_PERCENT: 'Spirit/Range',
  TECH_RADIUS_PERCENT: 'Spirit/Range',
  HEALTH_MAX: 'Defense/HP',
  HEALTH_MAX_PERCENT: 'Defense/HP',
  BASE_HEALTH_PERCENT: 'Defense/HP',
  HEALTH_REGEN_PER_SECOND: 'Defense/Regen',
  OUT_OF_COMBAT_HEALTH_REGEN: 'Defense/Out of Combat Regen',
  BARRIER_HEALTH: 'Defense/Barrier',
  HEAL_AMP_CAST_PERCENT: 'Defense/Healing',
  HEAL_AMP_RECEIVE_PERCENT: 'Defense/Healing',
  HEAL_AMP_REGEN_PERCENT: 'Defense/Healing',
  BULLET_LIFESTEAL: 'Defense/Lifesteal',
  TECH_LIFESTEAL: 'Defense/Lifesteal',
  TECH_DAMAGE_TAKEN_HEALS_ATTACKER: 'Defense/Lifesteal',
  BULLET_ARMOR_DAMAGE_RESIST: 'Defense/Physical Resistance',
  BULLET_RESIST_NON_HERO: 'Defense/Physical Resistance',
  TECH_RESIST: 'Defense/Spirit Resistance',
  MELEE_RESIST: 'Defense/Melee Resistance',
  STATUS_RESISTANCE: 'Defense/Debuff Resistance',
  MOVEMENT_SLOW_RESISTANCE: 'Defense/Slow Resistance',
  MOVEMENT_SPEED_MAX: 'Mobility/Move Speed',
  MOVEMENT_SPEED_WHILE_SHOOTING_PENALTY_REDUCTION_PERCENT: 'Mobility/Move Speed',
  MOVEMENT_SPEED_WHILE_ZOOMED_PENALTY_REDUCTION_PERCENT: 'Mobility/Move Speed',
  SPRINT_SPEED_BONUS: 'Mobility/Sprint',
  STAMINA: 'Mobility/Stamina',
  STAMINA_REGEN_PER_SECOND_PERCENTAGE: 'Mobility/Stamina',
  AIR_CONTROL_ACCEL_PERCENT: 'Mobility/Jump/Dash/Slide',
  AIR_CONTROL_PERCENT: 'Mobility/Jump/Dash/Slide',
  AIR_MOVE_DISTANCE_INCREASE_PERCENT: 'Mobility/Jump/Dash/Slide',
  MOVEMENT_GROUND_DASH_REDUCTION_PERCENT: 'Mobility/Jump/Dash/Slide',
  MOVEMENT_SLIDE_DISTANCE_SCALE: 'Mobility/Jump/Dash/Slide',
  BULLET_AND_MELEE_RESIST_REDUCTION: 'Disruption/Physical Vulnerability',
  TECH_RESIST_REDUCTION: 'Disruption/Spirit Vulnerability',
  FIRE_RATE_SLOW: 'Disruption/Fire Rate Reduction',
  MOVEMENT_SPEED_SLOW_PERCENT: 'Disruption/Slow'
});

const FILTER_BY_CSS = Object.freeze({
  tech_damage: 'Spirit/Spirit Damage',
  bullet_damage: 'Physical/Additional Physical Damage',
  fire_rate: 'Physical/Fire Rate',
  healing: 'Defense/Healing',
  move_speed: 'Mobility/Move Speed',
  slow: 'Disruption/Slow'
});

const FILTER_BY_STATUS = Object.freeze({
  StatusEffectStun: 'Disruption/Stun',
  StatusEffectImmobilize: 'Disruption/Immobilize',
  StatusEffectDisarmed: 'Disruption/Disarm',
  StatusEffectEMP: 'Disruption/Silence',
  StatusEffectInvisible: 'Mobility/Stealth'
});

const FILTER_BY_SCALE_STAT = Object.freeze({
  EWeaponPower: 'Physical/Weapon Damage',
  EBaseWeaponDamageIncrease: 'Physical/Weapon Damage',
  ETechPower: 'Spirit/Spirit Power',
  ETechRange: 'Spirit/Range'
});

const FILTER_BY_DISPLAY = Object.freeze({
  EBulletArmorDamageReduction: 'Defense/Physical Resistance',
  ETechArmorDamageReduction: 'Defense/Spirit Resistance'
});

function tooltipProperties(sections) {
  const names = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'm_strImportantProperty') names.add(entry);
      if (key === 'm_vecAbilityProperties' || key === 'm_vecElevatedAbilityProperties') {
        for (const name of entry) names.add(name);
      }
      if (typeof entry === 'object') walk(entry);
    }
  }
  walk(sections);
  return names;
}

// Text KV3 records use typed strings (resource_name:, panorama:) and nested maps.
export function parseShopFilterRecord(block) {
  const tokens = block.slice(block.indexOf('{')).match(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|[{}\[\]=,]|[^\s"{}\[\]=,]+/g)?.filter((token) => !token.startsWith('//')) || [];
  let index = 0;
  function value() {
    const token = tokens[index++];
    if (token === '{') {
      const result = {};
      while (tokens[index] !== '}') {
        if (index >= tokens.length) throw new Error('Unclosed VData record');
        const key = tokens[index++].replace(/^"|"$/g, '');
        if (tokens[index++] !== '=') throw new Error(`Expected VData assignment for ${key}`);
        result[key] = value();
        if (tokens[index] === ',') index += 1;
      }
      index += 1;
      return result;
    }
    if (token === '[') {
      const result = [];
      while (tokens[index] !== ']') {
        if (index >= tokens.length) throw new Error('Unclosed VData array');
        result.push(value());
        if (tokens[index] === ',') index += 1;
      }
      index += 1;
      return result;
    }
    if (token?.endsWith(':')) return value();
    if (token === undefined) throw new Error('Missing VData value');
    return token.startsWith('"') ? JSON.parse(token) : token;
  }
  return value();
}

function mergeRecords(base, record) {
  const result = { ...base };
  for (const [key, value] of Object.entries(record)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeRecords(result[key] || {}, value)
      : value;
  }
  return result;
}

function inheritedRecord(record, records, seen = new Set()) {
  const parsed = typeof record === 'string' ? parseShopFilterRecord(record) : record;
  let result = {};
  const bases = [...(parsed._multibase || []), ...[parsed._base, parsed.m_strBase].filter(Boolean)];
  for (const name of bases) {
    if (seen.has(name)) throw new Error(`Cyclic VData inheritance: ${name}`);
    const base = records.get(name);
    if (!base) throw new Error(`Missing VData base: ${name}`);
    result = mergeRecords(result, inheritedRecord(base, records, new Set([...seen, name])));
  }
  return mergeRecords(result, parsed);
}

export function deriveShopFilters(itemBlock, context) {
  const record = inheritedRecord(itemBlock, context.records);
  const filters = new Set();
  const add = (filter) => { if (filter) filters.add(filter); };
  // Unlisted properties can be obsolete stats or self-penalties, not shop features.
  for (const name of tooltipProperties(record.m_vecTooltipSectionInfo)) {
    add(FILTER_BY_STATUS[name]);
    const property = record.m_mapAbilityProperties?.[name];
    if (!property || property.m_bIsNegativeAttribute === 'true' || property.m_bIsNegativeAttribute === true) continue;
    const value = parseFloat(property.m_strValue);
    if (!Number.isFinite(value) || value === 0 || property.m_strValue === property.m_strDisableValue) continue;
    const type = (property.m_eProvidedPropertyType || record.m_mapAbilityProperties?.[property.m_strLocTokenOverride]?.m_eProvidedPropertyType)?.replace(/^MODIFIER_VALUE_/, '');
    add(FILTER_BY_SCALE_STAT[property.m_eScaleStatFilter]);
    if (value < 0) {
      if (type === 'TECH_POWER' || type === 'TECH_POWER_PERCENT' || type === 'TECH_DAMAGE_MULTIPLIER') add('Disruption/Spirit Damage Reduction');
      if (type === 'ALL_DAMAGE_MULTIPLIER') {
        add('Disruption/Bullet Damage Reduction');
        add('Disruption/Spirit Damage Reduction');
      }
      if (type === 'HEAL_AMP_RECEIVE_PERCENT' || type === 'HEAL_AMP_REGEN_PERCENT') add('Disruption/Anti-Healing');
      if (type === 'RELOAD_SPEED') add('Physical/Ammo');
      if (type === 'BULLET_AND_MELEE_RESIST_REDUCTION' || type === 'TECH_RESIST_REDUCTION' || type === 'FIRE_RATE_SLOW') add(FILTER_BY_PROPERTY[type]);
      continue;
    }
    const typedFilter = FILTER_BY_PROPERTY[type] || FILTER_BY_DISPLAY[property.m_eDisplayType];
    if (typedFilter) {
      add(typedFilter);
      continue;
    }
    // Split projectiles are additional hits, not a change to firing cadence.
    if (name === 'BulletSplitShot') {
      add('Physical/Additional Physical Damage');
      continue;
    }
    if (/Lifesteal|Lifestrike/.test(name)) {
      add('Defense/Lifesteal');
      continue;
    }
    for (const css of (property.m_strCSSClass || '').split(/\s+/)) {
      if (css === 'tech_damage' && /HealthPercent|MaxHealthPercent/.test(name)) add('Spirit/Health % Damage');
      else if (css === 'bullet_damage' && /WeaponDamage/.test(name)) add('Physical/Weapon Damage');
      else add(FILTER_BY_CSS[css]);
    }
  }
  if (record.m_eAbilityActivation && record.m_eAbilityActivation !== 'CITADEL_ABILITY_ACTIVATION_PASSIVE') add('Misc/Active Items');
  if ((record.m_TargetAbilityEffectsToApply || '').includes('CITADEL_TARGET_ABILITY_BEHAVIOR_IMBUE')) add('Misc/Imbue Items');
  for (const name of (record.m_eAdditionalShopFilters || '').split(/\s*\|\s*/)) add(FILTER_BY_ENUM[name]);
  for (const name of (record.m_eDisableShopFilters || '').split(/\s*\|\s*/)) filters.delete(FILTER_BY_ENUM[name]);
  return [...filters].sort();
}
