import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildCustomPassivePackage, OUTPUT_VDATA_PATH } from '../src/lib/packageBuilder.js';
import { readVpk } from '../src/lib/vpkReader.js';
import { writeVpk } from '../src/lib/vpkWriter.js';

const TEMPLATE_PATH = new URL('fixtures/templates/custom_passive/scripts/abilities.vdata_c.template', import.meta.url);

test('VPK writer and reader round-trip the patched resource', async () => {
  const templateBytes = new Uint8Array(await readFile(TEMPLATE_PATH));
  const result = buildCustomPassivePackage({
    templateBytes,
    selectedItemIds: ['upgrade_headshot_booster', 'upgrade_spirit_bubble']
  });
  const pak = writeVpk(result.files);
  const files = readVpk(pak);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, OUTPUT_VDATA_PATH);
  assert.deepEqual(files[0].bytes, result.vdataBytes);
});
