import { PASSIVE_FLAG_TYPE_OFFSETS } from '../data/deadlockItems.generated.js';
import { buildPassiveVdataBytes } from './passiveFlagTemplate.js';
import { compressSource2Resource } from './source2ResourceCompression.js';

export const OUTPUT_VDATA_PATH = 'scripts/abilities.vdata_c';

const templatePromises = new Map();

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto?.subtle?.digest('SHA-256', bytes);
  if (!digest) throw new Error('SHA-256 verification is unavailable in this browser');
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchTemplateBytes(templatePath, label) {
  const templateUrl = `${import.meta.env.BASE_URL}${templatePath}`;
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error(`Failed to load ${label} template (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadTemplateBytes({ templatePath, templateSha256, label = 'abilities.vdata_c' }) {
  const cacheKey = `${templatePath}:${templateSha256 || ''}`;
  if (!templatePromises.has(cacheKey)) {
    templatePromises.set(cacheKey, fetchTemplateBytes(templatePath, label).then(async (bytes) => {
      if (templateSha256) {
        const actualSha256 = await sha256Hex(bytes);
        if (actualSha256 !== templateSha256) {
          throw new Error(`${label} template SHA-256 mismatch: got ${actualSha256}, expected ${templateSha256}`);
        }
      }
      return bytes;
    }).catch((error) => {
      templatePromises.delete(cacheKey);
      throw error;
    }));
  }
  return templatePromises.get(cacheKey);
}


export function buildCustomPassivePackage({ templateBytes, selectedItemIds, offsets = PASSIVE_FLAG_TYPE_OFFSETS }) {
  const sortedSelectedItemIds = [...new Set(selectedItemIds || [])].sort();
  const vdataBytes = buildPassiveVdataBytes({
    templateBytes,
    selectedItemIds: sortedSelectedItemIds,
    offsets
  });
  return {
    files: [{ path: OUTPUT_VDATA_PATH, bytes: vdataBytes }],
    selectedItemIds: sortedSelectedItemIds,
    vdataBytes
  };
}


export async function buildCompressedCustomPassivePackage(options) {
  const built = buildCustomPassivePackage(options);
  const compressedVdataBytes = await compressSource2Resource(built.vdataBytes);
  return {
    ...built,
    files: [{ path: OUTPUT_VDATA_PATH, bytes: compressedVdataBytes }],
    vdataBytes: compressedVdataBytes,
    uncompressedVdataBytes: built.vdataBytes
  };
}
