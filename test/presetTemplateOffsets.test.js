import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { PRESET_TEMPLATES } from '../src/lib/presetTemplates.js';
import { buildPassiveVdataBytes, readPassiveSelectedItemIds } from '../src/lib/passiveFlagTemplate.js';
import { buildCustomPassivePackage } from '../src/lib/packageBuilder.js';
import { assertCompletePassiveFlagOffsets, readPassiveFlagTemplate } from '../src/lib/source2PassiveFlags.js';

const ITEM_IDS = DEADLOCK_ITEMS.map((item) => item.id);
const SAMPLE_IDS = ['upgrade_close_range', 'upgrade_headshot_booster'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

for (const preset of PRESET_TEMPLATES) {
  test(`${preset.label} template is verified and patchable`, async () => {
    const templateBytes = new Uint8Array(await readFile(new URL(`../public/${preset.templatePath}`, import.meta.url)));
    assert.equal(sha256(templateBytes), preset.templateSha256);

    const parsed = readPassiveFlagTemplate(templateBytes, ITEM_IDS);
    assertCompletePassiveFlagOffsets(parsed.offsets, ITEM_IDS);
    assert.deepEqual(readPassiveSelectedItemIds({
      vdataBytes: templateBytes,
      offsets: parsed.offsets
    }), []);
    const reset = buildPassiveVdataBytes({
      templateBytes,
      selectedItemIds: [],
      offsets: parsed.offsets
    });
    assert.deepEqual(readPassiveSelectedItemIds({
      vdataBytes: reset,
      offsets: parsed.offsets
    }), []);

    const built = buildCustomPassivePackage({
      templateBytes,
      selectedItemIds: SAMPLE_IDS,
      offsets: parsed.offsets
    });
    assert.deepEqual(built.selectedItemIds, [...SAMPLE_IDS].sort());
    assert.deepEqual(readPassiveSelectedItemIds({
      vdataBytes: built.vdataBytes,
      offsets: parsed.offsets
    }), [...SAMPLE_IDS].sort());
  });
}
