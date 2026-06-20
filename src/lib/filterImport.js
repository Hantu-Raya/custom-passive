import { PASSIVE_FLAG_TYPE_OFFSETS } from '../data/deadlockItems.generated.js';
import { extractArchiveMember } from './archiveExtractor.js';
import { readPassiveSelectedItemIds } from './passiveFlagTemplate.js';
import { readVpk } from './vpkReader.js';

const FILTER_ABILITIES_PATH = 'scripts/abilities.vdata_c';
const ARCHIVE_VPK_CANDIDATES = Object.freeze([
  'pak04_dir.vpk',
  'pak03_dir.vpk',
  'pak01_dir.vpk',
  'pak89_dir.vpk'
]);

function normalizePath(path) {
  return String(path || '').replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

function findAbilitiesFile(files) {
  const expected = normalizePath(FILTER_ABILITIES_PATH);
  return files.find((file) => normalizePath(file.path) === expected) || null;
}

export function importFilterVpkBytes(vpkBytes) {
  const files = readVpk(vpkBytes);
  const abilitiesFile = findAbilitiesFile(files);
  if (!abilitiesFile) throw new Error(`Uploaded filter VPK is missing ${FILTER_ABILITIES_PATH}`);
  const selectedItemIds = readPassiveSelectedItemIds({
    vdataBytes: abilitiesFile.bytes,
    offsets: PASSIVE_FLAG_TYPE_OFFSETS
  });
  return {
    selectedItemIds,
    fileCount: files.length,
    vdataBytes: abilitiesFile.bytes,
    vdataPath: abilitiesFile.path
  };
}

export async function importFilterArchiveBytes(archiveBytes, archiveName) {
  let lastError = null;
  for (const memberName of ARCHIVE_VPK_CANDIDATES) {
    try {
      const vpkBytes = await extractArchiveMember(archiveBytes, archiveName, memberName);
      return {
        ...importFilterVpkBytes(vpkBytes),
        archiveMember: memberName
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Uploaded archive does not contain a supported filter VPK');
}

