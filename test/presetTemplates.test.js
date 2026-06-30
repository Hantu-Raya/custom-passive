import assert from 'node:assert/strict';
import test from 'node:test';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { PRESET_TEMPLATE_IDS, PRESET_TEMPLATES, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../src/lib/presetTemplates.js';

const ALL_ITEM_IDS = DEADLOCK_ITEMS.map((item) => item.id).sort();

test('passive and active preset preselects yes-behavior archive selection without hiding shop items', () => {
  const preset = getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE);

  assert.equal(preset.label, 'Passive + Actives');
  assert.equal(preset.outputFileName, 'pak03_dir.vpk');
  assert.equal(preset.archiveOutputFileName, 'filter_for_passive_and_active_items_yesbehaviour_07_01.7z');
  assert.equal(preset.templatePath, 'templates/gamebanana/passive-and-active/scripts/abilities.vdata_c.template');
  assert.equal(preset.templateSha256, '96853c7da369502f832ff50a35d3e9b08fe4a0b46752f74784b72808dd7ac319');
  assert.equal(REQUIRED_GAMEBANANA_TEMPLATE.fileName, 'templete_07_01.7z');
  assert.equal(REQUIRED_GAMEBANANA_TEMPLATE.sha256, 'f76a12aeee6de8884cc652808021ca14df6210179d85c049215ee0ed1d335b6a');
  assert.equal(REQUIRED_GAMEBANANA_TEMPLATE.archiveMember, 'pak02_dir.vpk');
  assert.equal(REQUIRED_GAMEBANANA_TEMPLATE.modUrl, 'https://gamebanana.com/mods/601444');
  assert.equal(preset.sourceArchive.fileName, 'filter_for_passive_and_active_items_yesbehaviour_07_01.7z');
  assert.equal(preset.sourceArchive.sha256, 'b7d5efd06b7b58bc7965bb2b162b6cc7adc3feda085e5f862e4cc8ab0d03b641');
  assert.equal(preset.sourceArchive.archiveMember, 'pak03_dir.vpk');
  assert.deepEqual(preset.supportedItemIds, ALL_ITEM_IDS);
  assert.equal(preset.presetItemIds.length, 74);
  assert.ok(preset.presetItemIds.includes('upgrade_cold_front'));
  assert.ok(preset.presetItemIds.includes('upgrade_quick_silver'));
  assert.ok(preset.presetItemIds.includes('upgrade_split_shot'));
});

test('passive and active no-behavior preset matches pak05 archive', () => {
  const preset = getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE_NO_BEHAVIOR);

  assert.equal(preset.label, 'Passive + Actives (No Behavior)');
  assert.equal(preset.outputFileName, 'pak05_dir.vpk');
  assert.equal(preset.archiveOutputFileName, 'filter_for_passive_and_active_items_07_01.7z');
  assert.equal(preset.templatePath, 'templates/gamebanana/passive-and-active-no-behavior/scripts/abilities.vdata_c.template');
  assert.equal(preset.templateSha256, '6b228987acd1969e9b5876ddf5a6dddb29a0cd886d1766f51d2806770aceb96d');
  assert.equal(preset.sourceArchive.fileName, 'filter_for_passive_and_active_items_07_01.7z');
  assert.equal(preset.sourceArchive.sha256, 'f0fb3b0081db735ea20b03eef54afe25b62dc79817477aac8c1fdf12bd466ff5');
  assert.equal(preset.sourceArchive.archiveMember, 'pak05_dir.vpk');
  assert.deepEqual(preset.supportedItemIds, ALL_ITEM_IDS);
  assert.equal(preset.presetItemIds.length, 74);
});

test('passive only preset preselects source archive selection without hiding shop items', () => {
  const preset = getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);

  assert.equal(preset.label, 'Passive Only');
  assert.equal(preset.outputFileName, 'pak04_dir.vpk');
  assert.equal(preset.archiveOutputFileName, 'filter_for_passive_items_07_01.7z');
  assert.equal(preset.templatePath, 'templates/gamebanana/passive-only/scripts/abilities.vdata_c.template');
  assert.equal(preset.templateSha256, 'b6065280051f9ae804ed68600c32a5a3f497c9c94f1081936e50aa652e4ba70f');
  assert.equal(preset.sourceArchive.fileName, 'filter_for_passive_items_07_01.7z');
  assert.equal(preset.sourceArchive.sha256, '3aa58cca37931daf4f971394757c163207b566aa0c676cb48d009d2a862879d0');
  assert.equal(preset.sourceArchive.archiveMember, 'pak04_dir.vpk');
  assert.deepEqual(preset.supportedItemIds, ALL_ITEM_IDS);
  assert.equal(preset.presetItemIds.length, 33);
  assert.ok(preset.presetItemIds.includes('upgrade_headshot_booster'));
  assert.ok(preset.supportedItemIds.includes('upgrade_cold_front'));
});

test('preset templates expose stable unique ids', () => {
  const ids = PRESET_TEMPLATES.map((preset) => preset.id);

  assert.deepEqual(ids, [PRESET_TEMPLATE_IDS.PASSIVE_ONLY, PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE, PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE_NO_BEHAVIOR]);
  assert.equal(new Set(ids).size, ids.length);
  assert.throws(() => getPresetTemplate('unknown-preset'), /Unknown preset template/);
});
