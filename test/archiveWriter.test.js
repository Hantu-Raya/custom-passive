import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildCompressedCustomPassivePackage } from '../src/lib/packageBuilder.js';
import { writeSevenZipArchive } from '../src/lib/archiveWriter.js';
import { extractArchiveMember } from '../src/lib/archiveExtractor.js';
import { readVpk } from '../src/lib/vpkReader.js';
import { writeVpk } from '../src/lib/vpkWriter.js';

const TEMPLATE_PATH = new URL('fixtures/templates/custom_passive/scripts/abilities.vdata_c.template', import.meta.url);

test('archive writer compresses the generated VPK for distribution', async () => {
  const templateBytes = new Uint8Array(await readFile(TEMPLATE_PATH));
  const built = await buildCompressedCustomPassivePackage({
    templateBytes,
    selectedItemIds: ['upgrade_headshot_booster']
  });
  const pak = writeVpk(built.files);
  const archive = await writeSevenZipArchive({
    archiveFileName: 'filter_for_passive_items_06_19.7z',
    memberFileName: 'pak04_dir.vpk',
    memberBytes: pak
  });
  assert.ok(archive.byteLength < 450_000, `expected compressed archive, got ${archive.byteLength} bytes`);

  const extracted = await extractArchiveMember(archive, 'download.7z', 'pak04_dir.vpk');
  const files = readVpk(extracted);
  assert.deepEqual(files.map((file) => file.path), ['scripts/abilities.vdata_c']);
});
