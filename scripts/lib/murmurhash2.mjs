export function murmurHash2(str, seed = 0x31415926) {
  const bytes = new TextEncoder().encode(str);
  const multiplier = 0x5bd1e995;
  let hash = (seed ^ bytes.length) >>> 0;
  let offset = 0;

  while (offset + 4 <= bytes.length) {
    let word = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    word = Math.imul(word, multiplier);
    word ^= word >>> 24;
    word = Math.imul(word, multiplier);
    hash = Math.imul(hash, multiplier) ^ word;
    offset += 4;
  }

  const remaining = bytes.length - offset;
  if (remaining >= 3) hash ^= bytes[offset + 2] << 16;
  if (remaining >= 2) hash ^= bytes[offset + 1] << 8;
  if (remaining >= 1) {
    hash ^= bytes[offset];
    hash = Math.imul(hash, multiplier);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, multiplier);
  hash ^= hash >>> 15;
  return hash >>> 0;
}
