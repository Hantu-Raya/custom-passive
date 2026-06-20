export const BINARY_KV3_BOOLEAN_TRUE = 13;
export const BINARY_KV3_BOOLEAN_FALSE = 14;

function asBytes(input) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function isStringFlagOffset(offset) {
  return offset && typeof offset === 'object' && offset.type === 'string';
}

function assertByteOffset(offset, byteLength) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= byteLength) throw new Error(`Invalid passive flag offset: ${offset}`);
}

function assertStringOffset(offset, byteLength) {
  if (!Number.isInteger(offset?.offset) || offset.offset < 0 || offset.offset + 4 > byteLength) throw new Error(`Invalid passive string flag offset: ${offset?.offset}`);
  if (!Number.isInteger(offset.trueStringId) || !Number.isInteger(offset.falseStringId)) throw new Error('Invalid passive string flag IDs');
}

function writePassiveFlag(bytes, offset, selected) {
  if (isStringFlagOffset(offset)) {
    assertStringOffset(offset, bytes.byteLength);
    new DataView(bytes.buffer, bytes.byteOffset + offset.offset, 4).setInt32(0, selected ? offset.trueStringId : offset.falseStringId, true);
    return;
  }
  assertByteOffset(offset, bytes.byteLength);
  bytes[offset] = selected ? BINARY_KV3_BOOLEAN_TRUE : BINARY_KV3_BOOLEAN_FALSE;
}

function isPassiveFlagSelected(bytes, offset) {
  if (isStringFlagOffset(offset)) {
    assertStringOffset(offset, bytes.byteLength);
    return new DataView(bytes.buffer, bytes.byteOffset + offset.offset, 4).getInt32(0, true) === offset.trueStringId;
  }
  assertByteOffset(offset, bytes.byteLength);
  return bytes[offset] === BINARY_KV3_BOOLEAN_TRUE;
}

export function buildPassiveVdataBytes({ templateBytes, selectedItemIds, offsets }) {
  if (!templateBytes || templateBytes.byteLength === 0) {
    throw new Error('Missing abilities.vdata_c template');
  }
  const out = new Uint8Array(templateBytes);
  const offsetEntries = Object.entries(offsets || {});
  for (const [, offset] of offsetEntries) writePassiveFlag(out, offset, false);

  for (const id of new Set(selectedItemIds || [])) {
    const offset = offsets?.[id];
    if (offset === undefined) throw new Error(`Unknown Deadlock item: ${id}`);
    writePassiveFlag(out, offset, true);
  }

  return out;
}

export function readPassiveSelectedItemIds({ vdataBytes, offsets }) {
  if (!vdataBytes || vdataBytes.byteLength === 0) {
    throw new Error('Missing abilities.vdata_c bytes');
  }
  const bytes = asBytes(vdataBytes);
  const selected = [];
  for (const [id, offset] of Object.entries(offsets || {})) {
    if (isPassiveFlagSelected(bytes, offset)) selected.push(id);
  }
  return selected.sort();
}
