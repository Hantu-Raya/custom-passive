const SOURCE2_HEADER_SIZE = 16;
const SOURCE2_BLOCK_ENTRY_SIZE = 12;
export const BINARY_KV3_HEADER_SIZE = 120;
const BINARY_KV3_COMPRESSION_NONE = 0;
export const BINARY_KV3_COMPRESSION_ZSTD = 2;

const SOURCE2_RESOURCE_VERSION = 12;
const SOURCE2_BLOCK_INFO_OFFSET = 8;
const BINARY_KV3_MAGIC_MASK = 0xffffff00;
const BINARY_KV3_MAGIC = 0x4b563300;
const BINARY_KV3_VERSION = 5;
const TEXT_ENCODER = new TextEncoder();

function fail(message) {
  throw new Error(message);
}

export function asBytes(input) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function readFourCc(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

export function align(value, boundary) {
  return (value + boundary - 1) & ~(boundary - 1);
}

export function parseSource2Blocks(resourceBytes) {
  const bytes = asBytes(resourceBytes);
  if (bytes.byteLength < SOURCE2_HEADER_SIZE + SOURCE2_BLOCK_ENTRY_SIZE) fail('Source 2 resource is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) > bytes.byteLength) fail('Source 2 resource declares a size larger than the file');
  if (view.getUint32(4, true) !== SOURCE2_RESOURCE_VERSION) fail(`Unsupported Source 2 resource version ${view.getUint32(4, true)}`);
  const blockCount = view.getUint32(12, true);
  const tableEnd = SOURCE2_HEADER_SIZE + blockCount * SOURCE2_BLOCK_ENTRY_SIZE;
  if (view.getUint32(8, true) !== SOURCE2_BLOCK_INFO_OFFSET || blockCount < 1 || tableEnd > bytes.byteLength) fail('Source 2 resource has a malformed block table');

  const blocks = [];
  for (let index = 0; index < blockCount; index += 1) {
    const entryOffset = SOURCE2_HEADER_SIZE + index * SOURCE2_BLOCK_ENTRY_SIZE;
    const type = readFourCc(bytes, entryOffset);
    const offset = entryOffset + 4 + view.getUint32(entryOffset + 4, true);
    const size = view.getUint32(entryOffset + 8, true);
    if (offset < tableEnd || offset + size > bytes.byteLength) fail(`Source 2 resource block ${type} is out of bounds`);
    blocks.push({ type, offset, size, bytes: bytes.slice(offset, offset + size) });
  }
  return blocks;
}

export function rebuildSource2Resource(blocks) {
  let cursor = SOURCE2_HEADER_SIZE + blocks.length * SOURCE2_BLOCK_ENTRY_SIZE;
  const placements = blocks.map((block) => {
    cursor = align(cursor, 16);
    const offset = cursor;
    cursor += block.bytes.byteLength;
    return { ...block, offset, size: block.bytes.byteLength };
  });

  const out = new Uint8Array(cursor);
  const view = new DataView(out.buffer);
  view.setUint32(0, out.byteLength, true);
  view.setUint32(4, SOURCE2_RESOURCE_VERSION, true);
  view.setUint32(8, SOURCE2_BLOCK_INFO_OFFSET, true);
  view.setUint32(12, blocks.length, true);

  for (let index = 0; index < placements.length; index += 1) {
    const entryOffset = SOURCE2_HEADER_SIZE + index * SOURCE2_BLOCK_ENTRY_SIZE;
    out.set(TEXT_ENCODER.encode(placements[index].type), entryOffset);
    view.setUint32(entryOffset + 4, placements[index].offset - entryOffset - 4, true);
    view.setUint32(entryOffset + 8, placements[index].size, true);
    out.set(placements[index].bytes, placements[index].offset);
  }
  return out;
}

export function source2DataBlockIndex(blocks) {
  const index = blocks.findIndex((block) => block.type === 'DATA');
  if (index === -1) fail('Compiled resource has no DATA block');
  return index;
}

export function getSource2DataBlock(resourceBytes) {
  const blocks = parseSource2Blocks(resourceBytes);
  return blocks[source2DataBlockIndex(blocks)].bytes;
}

function validateBinaryKv3Header(data) {
  if (data.byteLength < BINARY_KV3_HEADER_SIZE) fail('Binary KV3 DATA block is too small');
  const header = data.slice(0, BINARY_KV3_HEADER_SIZE);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const signature = view.getUint32(0, true);
  if ((signature & BINARY_KV3_MAGIC_MASK) !== BINARY_KV3_MAGIC || (signature & 0xff) !== BINARY_KV3_VERSION) fail('Unsupported Binary KV3 signature');
  return { header, view };
}

export function splitUncompressedKv3Data(data) {
  const { header, view } = validateBinaryKv3Header(data);
  if (view.getUint32(20, true) !== BINARY_KV3_COMPRESSION_NONE) return null;
  const buffer1Size = view.getInt32(72, true);
  const buffer2Size = view.getInt32(80, true);
  const buffer1Start = BINARY_KV3_HEADER_SIZE;
  const buffer2Start = buffer1Start + buffer1Size;
  if (buffer1Size < 0 || buffer2Size < 0 || buffer2Start + buffer2Size !== data.byteLength) fail('Binary KV3 DATA buffer sizes are invalid');
  return {
    header,
    buffer1: data.slice(buffer1Start, buffer2Start),
    buffer2: data.slice(buffer2Start, buffer2Start + buffer2Size)
  };
}

function uncompressBinaryKv3Data(data, { decompressZstd }) {
  const { header, view } = validateBinaryKv3Header(data);
  const compressionMethod = view.getUint32(20, true);
  if (compressionMethod === BINARY_KV3_COMPRESSION_NONE) return data;
  if (compressionMethod !== BINARY_KV3_COMPRESSION_ZSTD) fail(`Unsupported Binary KV3 compression method ${compressionMethod}`);
  if (typeof decompressZstd !== 'function') fail('A zstd decompressor is required for compressed Binary KV3 DATA');

  const uncompressedBuffer1Size = view.getInt32(72, true);
  const uncompressedBuffer2Size = view.getInt32(80, true);
  const compressedBuffer1Size = view.getInt32(76, true);
  const compressedBuffer2Size = view.getInt32(84, true);
  const compressedBuffer1Start = BINARY_KV3_HEADER_SIZE;
  const compressedBuffer2Start = compressedBuffer1Start + compressedBuffer1Size;
  const compressedEnd = compressedBuffer2Start + compressedBuffer2Size;
  if (uncompressedBuffer1Size < 0 || uncompressedBuffer2Size < 0 || compressedBuffer1Size < 0 || compressedBuffer2Size < 0 || compressedEnd > data.byteLength) fail('Binary KV3 compressed buffer sizes are invalid');

  const buffer1 = asBytes(decompressZstd(data.slice(compressedBuffer1Start, compressedBuffer2Start)));
  const buffer2 = asBytes(decompressZstd(data.slice(compressedBuffer2Start, compressedEnd)));
  if (buffer1.byteLength !== uncompressedBuffer1Size || buffer2.byteLength !== uncompressedBuffer2Size) fail('Binary KV3 decompressed buffer sizes do not match header metadata');

  const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
  headerView.setUint32(20, BINARY_KV3_COMPRESSION_NONE, true);
  headerView.setUint16(26, 0, true);
  headerView.setInt32(76, buffer1.byteLength, true);
  headerView.setInt32(84, buffer2.byteLength, true);

  const out = new Uint8Array(BINARY_KV3_HEADER_SIZE + buffer1.byteLength + buffer2.byteLength);
  out.set(header, 0);
  out.set(buffer1, BINARY_KV3_HEADER_SIZE);
  out.set(buffer2, BINARY_KV3_HEADER_SIZE + buffer1.byteLength);
  return out;
}

export function uncompressSource2Resource(resourceBytes, options) {
  const bytes = asBytes(resourceBytes);
  const blocks = parseSource2Blocks(bytes);
  const dataIndex = source2DataBlockIndex(blocks);
  const data = blocks[dataIndex].bytes;
  const uncompressedData = uncompressBinaryKv3Data(data, options);
  if (uncompressedData === data) return bytes;
  const nextBlocks = blocks.map((block, index) => (index === dataIndex ? { ...block, bytes: uncompressedData } : block));
  return rebuildSource2Resource(nextBlocks);
}
