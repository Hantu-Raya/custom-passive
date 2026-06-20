import { toUint8Array } from './bytes.js';
import { safeFileName, sevenZipOptions } from './sevenZipWasm.js';

function archiveFsName(archiveName) {
  const clean = safeFileName(archiveName, 'archive.7z');
  if (clean.toLowerCase().endsWith('.zip') || clean.toLowerCase().endsWith('.7z')) return clean;
  return `${clean}.7z`;
}


export async function extractArchiveMember(archiveBytes, archiveName, memberName) {
  const { default: SevenZip } = await import('7z-wasm');
  const sevenZip = await SevenZip(sevenZipOptions());
  const safeArchiveName = archiveFsName(archiveName);
  sevenZip.FS.writeFile(safeArchiveName, toUint8Array(archiveBytes, 'Archive input'));

  const result = sevenZip.callMain(['x', '-y', '-bso0', '-bsp0', '-bse0', safeArchiveName, memberName]);
  if (typeof result === 'number' && result !== 0) {
    throw new Error(`Could not extract ${memberName}`);
  }

  try {
    return sevenZip.FS.readFile(memberName);
  } catch {
    throw new Error(`Archive member not found: ${memberName}`);
  }
}
