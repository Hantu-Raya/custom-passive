import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEADLOCK_ITEMS, PASSIVE_FLAG_TYPE_OFFSETS } from '../src/data/deadlockItems.generated.js';
import { BINARY_KV3_BOOLEAN_FALSE, BINARY_KV3_BOOLEAN_TRUE, buildPassiveVdataBytes, readPassiveSelectedItemIds } from '../src/lib/passiveFlagTemplate.js';

const TEMPLATE_PATH = new URL('fixtures/templates/custom_passive/scripts/abilities.vdata_c.template', import.meta.url);
const SAMPLE_IDS = ['upgrade_headshot_booster', 'upgrade_spirit_bubble'];

test('generated template has a false passive flag byte for every item', async () => {
  const template = new Uint8Array(await readFile(TEMPLATE_PATH));
  assert.ok(template.byteLength > 0);
  for (const item of DEADLOCK_ITEMS) {
    const offset = PASSIVE_FLAG_TYPE_OFFSETS[item.id];
    assert.equal(Number.isInteger(offset), true, item.id);
    assert.equal(template[offset], BINARY_KV3_BOOLEAN_FALSE, item.id);
  }
});

test('sample items flip without mutating the template buffer', async () => {
  const template = new Uint8Array(await readFile(TEMPLATE_PATH));
  const patched = buildPassiveVdataBytes({
    templateBytes: template,
    selectedItemIds: SAMPLE_IDS,
    offsets: PASSIVE_FLAG_TYPE_OFFSETS
  });
  for (const id of SAMPLE_IDS) {
    assert.equal(patched[PASSIVE_FLAG_TYPE_OFFSETS[id]], BINARY_KV3_BOOLEAN_TRUE, id);
    assert.equal(template[PASSIVE_FLAG_TYPE_OFFSETS[id]], BINARY_KV3_BOOLEAN_FALSE, id);
  }
});

test('reads selected passive ids from compiled template bytes', async () => {
  const template = new Uint8Array(await readFile(TEMPLATE_PATH));
  const patched = buildPassiveVdataBytes({
    templateBytes: template,
    selectedItemIds: SAMPLE_IDS,
    offsets: PASSIVE_FLAG_TYPE_OFFSETS
  });

  assert.deepEqual(readPassiveSelectedItemIds({ vdataBytes: patched, offsets: PASSIVE_FLAG_TYPE_OFFSETS }), [...SAMPLE_IDS].sort());
});
