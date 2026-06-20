import { toUint8Array } from './bytes.js';
import { safeFileName, sevenZipOptions } from './sevenZipWasm.js';


export async function writeSevenZipArchive({ archiveFileName, memberFileName, memberBytes }) {
  const { default: SevenZip } = await import('7z-wasm');
  const sevenZip = await SevenZip(sevenZipOptions());
  const archiveName = safeFileName(archiveFileName, 'archive.7z');
  const memberName = safeFileName(memberFileName, 'pak_dir.vpk');
  sevenZip.FS.writeFile(memberName, toUint8Array(memberBytes, memberName));
  const result = sevenZip.callMain(['a', '-t7z', '-mx=9', '-bso0', '-bsp0', '-bse0', archiveName, memberName]);
  if (typeof result === 'number' && result !== 0) throw new Error(`Could not create ${archiveName}`);
  return sevenZip.FS.readFile(archiveName);
}
