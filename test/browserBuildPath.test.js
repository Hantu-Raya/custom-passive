import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const BROWSER_FILES = [
  'src/components/CustomPassiveShop.jsx',
  'src/lib/packageBuilder.js',
  'src/lib/passiveFlagTemplate.js',
  'src/lib/source2PassiveFlags.js',
  'src/lib/source2ResourceCompression.js',
  'src/lib/source2BinaryKv3.js',
  'src/lib/presetTemplates.js',
  'src/lib/vpkWriter.js',
  'src/lib/vpkReader.js',
  'src/lib/download.js',
  'src/lib/archiveWriter.js',
  'src/lib/sevenZipWasm.js',
  'src/lib/crc32.js'
];
const FORBIDDEN = ['sr2compiler', 'vpkeditcli', 'Source2Viewer-CLI', 'PowerShell', 'python'];

test('browser build path uses in-browser archive download and no native tools', async () => {
  const sources = await Promise.all(BROWSER_FILES.map(async (file) => [file, await readFile(file, 'utf8')]));
  const combined = sources.map(([, source]) => source).join('\n');
  assert.match(combined, /writeVpk/);
  assert.match(combined, /downloadBytes/);
  for (const [file, source] of sources) {
    for (const needle of FORBIDDEN) {
      assert.equal(source.includes(needle), false, `${file} must not include ${needle}`);
    }
  }
});
