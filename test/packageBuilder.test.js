import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PASSIVE_FLAG_TYPE_OFFSETS } from '../src/data/deadlockItems.generated.js';
import { BINARY_KV3_BOOLEAN_FALSE, BINARY_KV3_BOOLEAN_TRUE } from '../src/lib/passiveFlagTemplate.js';
import { OUTPUT_VDATA_PATH, buildCompressedCustomPassivePackage, buildCustomPassivePackage } from '../src/lib/packageBuilder.js';
import { getSource2DataBlock } from '../src/lib/source2BinaryKv3.js';

const TEMPLATE_PATH = new URL('fixtures/templates/custom_passive/scripts/abilities.vdata_c.template', import.meta.url);
const SELECTED = ['upgrade_headshot_booster', 'upgrade_spirit_bubble'];



test('package builder emits patched abilities.vdata_c file', async () => {
  const templateBytes = new Uint8Array(await readFile(TEMPLATE_PATH));
  const result = buildCustomPassivePackage({ templateBytes, selectedItemIds: SELECTED });
  assert.deepEqual(result.files.map((file) => file.path), [OUTPUT_VDATA_PATH]);
  assert.deepEqual(result.selectedItemIds, [...SELECTED].sort());
  for (const id of SELECTED) {
    assert.equal(result.vdataBytes[PASSIVE_FLAG_TYPE_OFFSETS[id]], BINARY_KV3_BOOLEAN_TRUE, id);
  }
  assert.equal(result.vdataBytes[PASSIVE_FLAG_TYPE_OFFSETS.upgrade_sprint_booster], BINARY_KV3_BOOLEAN_FALSE);
});

test('compressed package writes Source 2 zstd size fields consistently', async () => {
  const templateBytes = new Uint8Array(await readFile(TEMPLATE_PATH));
  const result = await buildCompressedCustomPassivePackage({
    templateBytes,
    selectedItemIds: SELECTED
  });
  const data = getSource2DataBlock(result.vdataBytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const compressedTotalSize = view.getInt32(76, true) + view.getInt32(84, true);
  assert.equal(view.getUint32(20, true), 2);
  assert.equal(view.getInt32(52, true), compressedTotalSize);
  assert.equal(data.byteLength, 120 + compressedTotalSize);
  assert.ok(result.vdataBytes.byteLength < 500_000, `expected compressed resource, got ${result.vdataBytes.byteLength} bytes`);
  assert.ok(result.uncompressedVdataBytes.byteLength > 2_000_000, `expected original uncompressed bytes, got ${result.uncompressedVdataBytes.byteLength}`);
});
