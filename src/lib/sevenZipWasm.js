export function sevenZipOptions() {
  if (typeof window === 'undefined') return undefined;
  const baseUrl = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
  return {
    locateFile(path) {
      return path.endsWith('.wasm') ? `${baseUrl.replace(/\/?$/, '/')}7zz.wasm` : path;
    }
  };
}

export function safeFileName(fileName, fallback) {
  const clean = String(fileName || fallback).replace(/[\\/:*?"<>|]+/g, '_');
  return clean || fallback;
}
