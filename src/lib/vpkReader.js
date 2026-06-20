const VPK_MAGIC = 0x55aa1234;
const VPK_VERSION = 2;
const HEADER_SIZE = 28;
const EMBEDDED_ARCHIVE_INDEX = 0x7fff;
const ENTRY_TERMINATOR = 0xffff;

function asBytes(input) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function readCString(bytes, cursor, limit) {
  let end = cursor;
  while (end < limit && bytes[end] !== 0) end += 1;
  if (end >= limit) throw new Error("Malformed VPK tree");
  return {
    value: new TextDecoder().decode(bytes.slice(cursor, end)),
    next: end + 1
  };
}

function joinPath(dir, name, ext) {
  const fileName = `${name}.${ext}`;
  return dir && dir !== " " ? `${dir}/${fileName}` : fileName;
}

function readHeader(bytes) {
  if (bytes.byteLength < HEADER_SIZE) throw new Error("Invalid VPK file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== VPK_MAGIC) throw new Error("Invalid VPK file");
  if (view.getUint32(4, true) !== VPK_VERSION) throw new Error("Unsupported VPK version");

  const treeSize = view.getUint32(8, true);
  const dataSize = view.getUint32(12, true);
  const treeStart = HEADER_SIZE;
  const treeEnd = treeStart + treeSize;
  const dataStart = treeEnd;
  if (treeEnd > bytes.byteLength || dataStart + dataSize > bytes.byteLength) {
    throw new Error("Malformed VPK file");
  }
  return { view, treeStart, treeEnd, dataStart };
}

function readEntry(view, cursor, treeEnd) {
  if (cursor + 18 > treeEnd) throw new Error("Malformed VPK entry");
  const preloadBytes = view.getUint16(cursor + 4, true);
  const archiveIndex = view.getUint16(cursor + 6, true);
  const entryOffset = view.getUint32(cursor + 8, true);
  const entryLength = view.getUint32(cursor + 12, true);
  const terminator = view.getUint16(cursor + 16, true);
  if (terminator !== ENTRY_TERMINATOR) throw new Error("Malformed VPK entry");
  if (preloadBytes !== 0) throw new Error("Unsupported VPK preload data");
  if (archiveIndex !== EMBEDDED_ARCHIVE_INDEX) throw new Error("Unsupported VPK archive index");
  return {
    entryOffset,
    entryLength,
    next: cursor + 18
  };
}

function readFileEntries(bytes, view, cursor, treeEnd, dataStart, ext, dir, files) {
  while (cursor < treeEnd) {
    const namePart = readCString(bytes, cursor, treeEnd);
    cursor = namePart.next;
    if (!namePart.value) return cursor;

    const entry = readEntry(view, cursor, treeEnd);
    cursor = entry.next;
    const start = dataStart + entry.entryOffset;
    const end = start + entry.entryLength;
    if (start < dataStart || end > bytes.byteLength) throw new Error("Malformed VPK entry data");
    files.push({
      path: joinPath(dir, namePart.value, ext),
      bytes: bytes.slice(start, end)
    });
  }
  return cursor;
}

function readDirectoryEntries(bytes, view, cursor, treeEnd, dataStart, ext, files) {
  while (cursor < treeEnd) {
    const dirPart = readCString(bytes, cursor, treeEnd);
    cursor = dirPart.next;
    if (!dirPart.value) return cursor;
    cursor = readFileEntries(bytes, view, cursor, treeEnd, dataStart, ext, dirPart.value, files);
  }
  return cursor;
}

export function readVpk(input) {
  const bytes = asBytes(input);
  const { view, treeStart, treeEnd, dataStart } = readHeader(bytes);
  const files = [];
  let cursor = treeStart;
  while (cursor < treeEnd) {
    const extPart = readCString(bytes, cursor, treeEnd);
    cursor = extPart.next;
    if (!extPart.value) break;
    cursor = readDirectoryEntries(bytes, view, cursor, treeEnd, dataStart, extPart.value, files);
  }
  return files;
}
