import { align, asBytes, BINARY_KV3_HEADER_SIZE, parseSource2Blocks } from './source2BinaryKv3.js';
import { BINARY_KV3_BOOLEAN_FALSE, BINARY_KV3_BOOLEAN_TRUE } from './passiveFlagTemplate.js';

const KV_TYPE = Object.freeze({
  NULL: 1,
  BOOLEAN: 2,
  INT64: 3,
  UINT64: 4,
  DOUBLE: 5,
  STRING: 6,
  BINARY_BLOB: 7,
  ARRAY: 8,
  OBJECT: 9,
  ARRAY_TYPED: 10,
  INT32: 11,
  UINT32: 12,
  BOOLEAN_TRUE: BINARY_KV3_BOOLEAN_TRUE,
  BOOLEAN_FALSE: BINARY_KV3_BOOLEAN_FALSE,
  INT64_ZERO: 15,
  INT64_ONE: 16,
  DOUBLE_ZERO: 17,
  DOUBLE_ONE: 18,
  FLOAT: 19,
  INT16: 20,
  UINT16: 21,
  INT32_AS_BYTE: 23,
  ARRAY_TYPE_BYTE_LENGTH: 24,
  ARRAY_TYPE_AUXILIARY_BUFFER: 25
});

const EMPTY_KV_TYPES = new Set([
  KV_TYPE.NULL,
  KV_TYPE.BOOLEAN_TRUE,
  KV_TYPE.BOOLEAN_FALSE,
  KV_TYPE.INT64_ZERO,
  KV_TYPE.INT64_ONE,
  KV_TYPE.DOUBLE_ZERO,
  KV_TYPE.DOUBLE_ONE
]);
const SCALAR_KV_BUFFERS = new Map([
  [KV_TYPE.BOOLEAN, ['bytes1', 1]],
  [KV_TYPE.INT32_AS_BYTE, ['bytes1', 1]],
  [KV_TYPE.INT16, ['bytes2', 2]],
  [KV_TYPE.UINT16, ['bytes2', 2]],
  [KV_TYPE.INT32, ['bytes4', 4]],
  [KV_TYPE.UINT32, ['bytes4', 4]],
  [KV_TYPE.FLOAT, ['bytes4', 4]],
  [KV_TYPE.STRING, ['bytes4', 4]],
  [KV_TYPE.INT64, ['bytes8', 8]],
  [KV_TYPE.UINT64, ['bytes8', 8]],
  [KV_TYPE.DOUBLE, ['bytes8', 8]]
]);

const TEXT_DECODER = new TextDecoder('utf-8');
const TRAILER = 0xffeedd00;
const SCAN_COMPLETE = Symbol('scan-complete');


function fail(message) {
  throw new Error(message);
}


function segment(bytes, start = 0, size = bytes.byteLength - start, absoluteBase = start) {
  return { bytes: bytes.subarray(start, start + size), offset: 0, absoluteBase };
}

function ensureAvailable(seg, size, label) {
  if (seg.offset + size > seg.bytes.byteLength) fail(`Binary KV3 truncated while reading ${label}`);
}

function take(seg, size, label) {
  ensureAvailable(seg, size, label);
  const start = seg.offset;
  seg.offset += size;
  return seg.bytes.subarray(start, start + size);
}

function readUint8(seg, label = 'uint8') {
  return take(seg, 1, label)[0];
}

function readInt32(seg) {
  const bytes = take(seg, 4, 'int32');
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getInt32(0, true);
}

function peekInt32(seg) {
  ensureAvailable(seg, 4, 'int32');
  return new DataView(seg.bytes.buffer, seg.bytes.byteOffset + seg.offset, 4).getInt32(0, true);
}

function readNullTermUtf8String(seg) {
  const start = seg.offset;
  while (seg.offset < seg.bytes.byteLength && seg.bytes[seg.offset] !== 0) seg.offset += 1;
  if (seg.offset >= seg.bytes.byteLength) fail('Unterminated Binary KV3 string');
  const bytes = seg.bytes.subarray(start, seg.offset);
  seg.offset += 1;
  return TEXT_DECODER.decode(bytes);
}

function skip(seg, size, label) {
  take(seg, size, label);
}

function splitBuffer(bytes, counts, options = {}) {
  let offset = 0;
  const out = {};
  if (options.includeObjectLengths) {
    const size = counts.countObjects * 4;
    out.objectLengths = segment(bytes, offset, size, options.absoluteBase + offset);
    offset += size;
  }
  out.bytes1 = segment(bytes, offset, counts.countBytes1, options.absoluteBase + offset);
  offset += counts.countBytes1;
  if (counts.countBytes2 > 0) offset = align(offset, 2);
  out.bytes2 = segment(bytes, offset, counts.countBytes2 * 2, options.absoluteBase + offset);
  offset += counts.countBytes2 * 2;
  if (counts.countBytes4 > 0) offset = align(offset, 4);
  out.bytes4 = segment(bytes, offset, counts.countBytes4 * 4, options.absoluteBase + offset);
  offset += counts.countBytes4 * 4;
  if (counts.countBytes8 > 0) offset = align(offset, 8);
  out.bytes8 = segment(bytes, offset, counts.countBytes8 * 8, options.absoluteBase + offset);
  offset += counts.countBytes8 * 8;
  out.endOffset = offset;
  return out;
}


function readType(context) {
  const offset = context.types.absoluteBase + context.types.offset;
  let dataByte = readUint8(context.types, 'type');
  let flag = 0;
  if ((dataByte & 0x80) > 0) {
    dataByte &= 0x3f;
    flag = readUint8(context.types, 'flag');
  }
  return { type: dataByte, flag, offset };
}

function readStringById(context, id) {
  if (id < 0 || id >= context.strings.length) fail(`Binary KV3 string id ${id} is out of bounds`);
  return context.strings[id];
}

function recordPassiveFlagOffset(context, typeInfo, key, currentRecord) {
  if (!currentRecord || key !== 'm_bShowInPassiveItemsArea') return;
  if (typeInfo.type === KV_TYPE.BOOLEAN_FALSE || typeInfo.type === KV_TYPE.BOOLEAN_TRUE) {
    context.offsets[currentRecord] = context.dataBlockOffset + typeInfo.offset;
    if (typeInfo.type === KV_TYPE.BOOLEAN_TRUE) context.selectedItemIds.push(currentRecord);
    if (context.remainingIds) {
      context.remainingIds.delete(currentRecord);
      if (context.remainingIds.size === 0) throw SCAN_COMPLETE;
    }
    return;
  }
  if (typeInfo.type === KV_TYPE.STRING) {
    const stringId = peekInt32(context.buffer.bytes4);
    const value = readStringById(context, stringId);
    if (value === 'true') context.selectedItemIds.push(currentRecord);
    else if (value !== 'false') fail(`Template flag for ${currentRecord} is string ${value}, expected true/false`);
    context.offsets[currentRecord] = Object.freeze({
      type: 'string',
      offset: context.dataBlockOffset + context.buffer.bytes4.absoluteBase + context.buffer.bytes4.offset,
      trueStringId: context.trueStringId,
      falseStringId: context.falseStringId
    });
    if (context.remainingIds) {
      context.remainingIds.delete(currentRecord);
      if (context.remainingIds.size === 0) throw SCAN_COMPLETE;
    }
    return;
  }
  fail(`Template flag for ${currentRecord} is type ${typeInfo.type}, expected boolean true/false`);
}


function consumeArray(context, currentRecord) {
  const length = readInt32(context.buffer.bytes4);
  for (let index = 0; index < length; index += 1) consumeValue(context, readType(context), '', currentRecord);
}
function consumeRepeatedValues(context, length, typeInfo, currentRecord) {
  for (let index = 0; index < length; index += 1) consumeValue(context, typeInfo, '', currentRecord);
}

function consumeTypedArray(context, type, currentRecord) {
  const length = type === KV_TYPE.ARRAY_TYPE_BYTE_LENGTH ? readUint8(context.buffer.bytes1) : readInt32(context.buffer.bytes4);
  consumeRepeatedValues(context, length, readType(context), currentRecord);
}

function consumeAuxiliaryArray(context, currentRecord) {
  const length = readUint8(context.buffer.bytes1);
  const subType = readType(context);
  const previousBuffer = context.buffer;
  context.buffer = context.auxiliaryBuffer;
  context.auxiliaryBuffer = previousBuffer;
  consumeRepeatedValues(context, length, subType, currentRecord);
  context.auxiliaryBuffer = context.buffer;
  context.buffer = previousBuffer;
}

function consumeObject(context, key, currentRecord) {
  const length = readInt32(context.objectLengths);
  const nestedRecord = context.candidateIds.has(key) ? key : currentRecord;
  for (let index = 0; index < length; index += 1) {
    const childType = readType(context);
    const childKey = readStringById(context, readInt32(context.buffer.bytes4));
    consumeValue(context, childType, childKey, nestedRecord);
  }
}

function consumeValue(context, typeInfo, key = '', currentRecord = '') {
  const type = typeInfo.type;
  recordPassiveFlagOffset(context, typeInfo, key, currentRecord);
  if (EMPTY_KV_TYPES.has(type)) return;
  const scalarBuffer = SCALAR_KV_BUFFERS.get(type);
  if (scalarBuffer) return skip(context.buffer[scalarBuffer[0]], scalarBuffer[1], `${scalarBuffer[0]} scalar`);
  if (type === KV_TYPE.BINARY_BLOB) fail('Binary blobs are not expected in abilities item records');
  if (type === KV_TYPE.ARRAY) return consumeArray(context, currentRecord);
  if (type === KV_TYPE.ARRAY_TYPED || type === KV_TYPE.ARRAY_TYPE_BYTE_LENGTH) return consumeTypedArray(context, type, currentRecord);
  if (type === KV_TYPE.ARRAY_TYPE_AUXILIARY_BUFFER) return consumeAuxiliaryArray(context, currentRecord);
  if (type === KV_TYPE.OBJECT) return consumeObject(context, key, currentRecord);
  fail(`Unknown Binary KV3 node type ${type}`);
}

function scanPassiveFlags(resourceBytes, candidateIds, options = {}) {
  const bytes = asBytes(resourceBytes);
  const dataBlock = parseSource2Blocks(bytes).find((block) => block.type === 'DATA');
  if (!dataBlock) fail('Compiled resource has no DATA block');

  const data = bytes.subarray(dataBlock.offset, dataBlock.offset + dataBlock.size);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true);
  if ((magic & 0xffffff00) !== 0x4b563300 || (magic & 0xff) !== 5) fail('Unsupported Binary KV3 signature');
  const method = view.getUint32(20, true);
  if (method !== 0) fail(`Passive flag scan requires uncompressed Binary KV3 DATA, got method ${method}`);

  const counts = {
    countBytes1: view.getInt32(28, true),
    countBytes4: view.getInt32(32, true),
    countBytes8: view.getInt32(36, true),
    countTypes: view.getInt32(40, true),
    countBytes2: view.getInt32(60, true),
    sizeUncompressedBuffer1: view.getInt32(72, true),
    sizeUncompressedBuffer2: view.getInt32(80, true),
    countBytes1Buffer2: view.getInt32(88, true),
    countBytes2Buffer2: view.getInt32(92, true),
    countBytes4Buffer2: view.getInt32(96, true),
    countBytes8Buffer2: view.getInt32(100, true),
    countObjectsBuffer2: view.getInt32(108, true)
  };
  const buffer1Start = BINARY_KV3_HEADER_SIZE;
  const buffer2Start = buffer1Start + counts.sizeUncompressedBuffer1;
  const buffer1Bytes = data.subarray(buffer1Start, buffer2Start);
  const buffer2Bytes = data.subarray(buffer2Start, buffer2Start + counts.sizeUncompressedBuffer2);
  const buffer1 = splitBuffer(buffer1Bytes, counts, { absoluteBase: buffer1Start });
  const stringCount = readInt32(buffer1.bytes4);
  const strings = [];
  for (let index = 0; index < stringCount; index += 1) strings.push(readNullTermUtf8String(buffer1.bytes1));

  const buffer2 = splitBuffer(buffer2Bytes, {
    countBytes1: counts.countBytes1Buffer2,
    countBytes2: counts.countBytes2Buffer2,
    countBytes4: counts.countBytes4Buffer2,
    countBytes8: counts.countBytes8Buffer2,
    countObjects: counts.countObjectsBuffer2
  }, { includeObjectLengths: true, absoluteBase: buffer2Start });
  const typesStart = buffer2Start + buffer2.endOffset;
  const trailerOffset = typesStart + counts.countTypes;
  if (new DataView(data.buffer, data.byteOffset + trailerOffset, 4).getUint32(0, true) !== TRAILER) fail('Binary KV3 trailer is invalid');

  const context = {
    strings,
    types: segment(data, typesStart, counts.countTypes, typesStart),
    buffer: buffer2,
    auxiliaryBuffer: buffer1,
    objectLengths: buffer2.objectLengths,
    candidateIds: new Set(candidateIds),
    remainingIds: options.stopWhenComplete === false ? null : new Set(candidateIds),
    offsets: {},
    selectedItemIds: [],
    dataBlockOffset: dataBlock.offset,
    trueStringId: strings.indexOf('true'),
    falseStringId: strings.indexOf('false')
  };
  try {
    consumeValue(context, readType(context));
  } catch (error) {
    if (error !== SCAN_COMPLETE) throw error;
  }
  return {
    offsets: Object.freeze(context.offsets),
    selectedItemIds: Object.freeze([...new Set(context.selectedItemIds)].sort())
  };
}

export function readPassiveFlagTemplate(resourceBytes, candidateIds) {
  return scanPassiveFlags(resourceBytes, candidateIds);
}

export function readPassiveFlagSelectedItemIds(resourceBytes, candidateIds) {
  return scanPassiveFlags(resourceBytes, candidateIds, {
    acceptStringFlags: true,
    stopWhenComplete: false
  }).selectedItemIds;
}

export function assertCompletePassiveFlagOffsets(offsets, candidateIds) {
  const missing = [];
  for (const id of candidateIds) {
    if (offsets[id] === undefined) missing.push(id);
  }
  if (missing.length > 0) throw new Error(`Template is missing passive flag offsets for ${missing.length} item${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`);
}
