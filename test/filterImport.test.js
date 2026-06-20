import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import SevenZip from '7z-wasm';
import { PASSIVE_FLAG_TYPE_OFFSETS } from '../src/data/deadlockItems.generated.js';
import { importFilterArchiveBytes, importFilterVpkBytes } from '../src/lib/filterImport.js';
import { buildPassiveVdataBytes } from '../src/lib/passiveFlagTemplate.js';
import { writeVpk } from '../src/lib/vpkWriter.js';

const TEMPLATE_PATH = new URL('fixtures/templates/custom_passive/scripts/abilities.vdata_c.template', import.meta.url);
const SELECTED = ['upgrade_close_range', 'upgrade_cold_front', 'upgrade_quick_silver'];

async function buildSelectedFilterVpk() {
  const template = new Uint8Array(await readFile(TEMPLATE_PATH));
  const vdata = buildPassiveVdataBytes({
    templateBytes: template,
    selectedItemIds: SELECTED,
    offsets: PASSIVE_FLAG_TYPE_OFFSETS
  });
  return {
    vdata,
    vpk: writeVpk([{ path: 'scripts/abilities.vdata_c', bytes: vdata }])
  };
}

test('imports selected passive ids from a filter VPK abilities file', async () => {
  const { vdata, vpk } = await buildSelectedFilterVpk();

  const result = importFilterVpkBytes(vpk);

  assert.deepEqual(result.selectedItemIds, [...SELECTED].sort());
  assert.equal(result.vdataPath, 'scripts/abilities.vdata_c');
  assert.deepEqual(result.vdataBytes, vdata);
});

test('imports selected passive ids from a GameBanana-style 7z filter archive', async () => {
  const { vpk } = await buildSelectedFilterVpk();
  const sevenZip = await SevenZip();
  sevenZip.FS.writeFile('pak04_dir.vpk', vpk);
  const resultCode = sevenZip.callMain(['a', '-bso0', '-bsp0', '-bse0', 'filter.7z', 'pak04_dir.vpk']);
  assert.equal(resultCode, 0);

  const result = await importFilterArchiveBytes(sevenZip.FS.readFile('filter.7z'), 'filter.7z');

  assert.deepEqual(result.selectedItemIds, [...SELECTED].sort());
  assert.equal(result.archiveMember, 'pak04_dir.vpk');
});

test('rejects filter VPKs without abilities.vdata_c', () => {
  const vpk = writeVpk([{ path: 'scripts/not_abilities.vdata_c', bytes: new Uint8Array([1, 2, 3]) }]);

  assert.throws(() => importFilterVpkBytes(vpk), /missing scripts\/abilities\.vdata_c/);
});
