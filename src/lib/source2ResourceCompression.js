import { compress, init } from '@bokuweb/zstd-wasm';
import xxhash from 'xxhash-wasm';
import {
  BINARY_KV3_COMPRESSION_ZSTD,
  BINARY_KV3_HEADER_SIZE,
  parseSource2Blocks,
  rebuildSource2Resource,
  source2DataBlockIndex,
  splitUncompressedKv3Data
} from './source2BinaryKv3.js';

const ZSTD_LEVEL = 10;

let zstdReadyPromise = null;
let xxhashReadyPromise = null;

async function ensureZstdReady() {
  zstdReadyPromise ??= init(`${import.meta.env?.BASE_URL || '/'}zstd.wasm`);
  await zstdReadyPromise;
}

async function ensureXxhashReady() {
  xxhashReadyPromise ??= xxhash();
  return xxhashReadyPromise;
}

async function addZstdContentChecksum(compressedBytes, uncompressedBytes) {
  const { h64Raw } = await ensureXxhashReady();
  const checksum = Number(h64Raw(uncompressedBytes, 0n) & 0xffffffffn);
  const out = new Uint8Array(compressedBytes.byteLength + 4);
  out.set(compressedBytes, 0);
  out[4] |= 0x04;
  new DataView(out.buffer).setUint32(out.byteLength - 4, checksum, true);
  return out;
}

export async function compressSource2Resource(resourceBytes) {
  const blocks = parseSource2Blocks(resourceBytes);
  const dataIndex = source2DataBlockIndex(blocks);
  const kv3 = splitUncompressedKv3Data(blocks[dataIndex].bytes);
  if (!kv3) return resourceBytes instanceof Uint8Array ? resourceBytes : new Uint8Array(resourceBytes);

  await ensureZstdReady();
  const compressedBuffer1 = await addZstdContentChecksum(compress(kv3.buffer1, ZSTD_LEVEL), kv3.buffer1);
  const compressedBuffer2 = await addZstdContentChecksum(compress(kv3.buffer2, ZSTD_LEVEL), kv3.buffer2);
  const compressedTotalSize = compressedBuffer1.byteLength + compressedBuffer2.byteLength;

  const headerView = new DataView(kv3.header.buffer, kv3.header.byteOffset, kv3.header.byteLength);
  headerView.setUint32(20, BINARY_KV3_COMPRESSION_ZSTD, true);
  headerView.setUint16(24, 0, true);
  headerView.setUint16(26, 0, true);
  headerView.setInt32(52, compressedTotalSize, true);
  headerView.setInt32(76, compressedBuffer1.byteLength, true);
  headerView.setInt32(84, compressedBuffer2.byteLength, true);

  const compressedData = new Uint8Array(BINARY_KV3_HEADER_SIZE + compressedTotalSize);
  compressedData.set(kv3.header, 0);
  compressedData.set(compressedBuffer1, BINARY_KV3_HEADER_SIZE);
  compressedData.set(compressedBuffer2, BINARY_KV3_HEADER_SIZE + compressedBuffer1.byteLength);

  const compressedBlocks = blocks.map((block, index) => (index === dataIndex ? { ...block, bytes: compressedData } : block));
  return rebuildSource2Resource(compressedBlocks);
}
