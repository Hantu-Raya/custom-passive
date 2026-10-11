/* global __WEB_BUILD__ */
import { GAMEBANANA_MOD_SOURCE } from '../data/gamebananaSources.generated.js';

const FALLBACK_BUILD = Object.freeze({ buildId: 'local', commit: 'local', builtAt: null });
const WEB_BUILD = typeof __WEB_BUILD__ === 'undefined' ? FALLBACK_BUILD : __WEB_BUILD__;
const VERSION_FETCH_TIMEOUT_MS = 8000;

export const WEB_VERSION_FILE = 'version.json';

export const WEB_VERSION = Object.freeze({
  buildId: String(WEB_BUILD.buildId),
  commit: String(WEB_BUILD.commit),
  builtAt: WEB_BUILD.builtAt ? String(WEB_BUILD.builtAt) : null,
  batch: GAMEBANANA_MOD_SOURCE.batchDateTag
});

function baseUrl() {
  return import.meta.env?.BASE_URL ?? '/';
}

export function parseWebVersion(value) {
  if (!value || typeof value !== 'object') throw new Error('Web version response is not an object.');
  for (const key of ['buildId', 'commit', 'batch']) {
    if (typeof value[key] !== 'string' || !value[key]) throw new Error(`Web version response is missing ${key}.`);
  }
  if (value.builtAt !== null && typeof value.builtAt !== 'string') throw new Error('Web version response has an invalid builtAt.');
  return Object.freeze({ buildId: value.buildId, commit: value.commit, builtAt: value.builtAt, batch: value.batch });
}

export function isNewerWebVersion(current, deployed) {
  return Boolean(deployed) && deployed.buildId !== current.buildId;
}

export async function fetchDeployedWebVersion({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Version check needs fetch support.');
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), VERSION_FETCH_TIMEOUT_MS) : null;
  try {
    // The query string skips the Pages CDN copy; no-store skips the browser cache.
    const response = await fetchImpl(`${baseUrl()}${WEB_VERSION_FILE}?t=${now}`, { cache: 'no-store', signal: controller?.signal });
    if (!response.ok) throw new Error(`Version check failed with HTTP ${response.status}.`);
    return parseWebVersion(await response.json());
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Version check timed out after 8 seconds.');
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function formatBuildDate(builtAt) {
  if (!builtAt) return 'Local build';
  const date = new Date(builtAt);
  if (Number.isNaN(date.getTime())) return 'Local build';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// The panel font has no underscore glyph, so show MM_DD as MM/DD.
export function formatBatch(batch) {
  return String(batch).replace(/_/g, '/');
}

// Rounds up, like a countdown: a fresh 12-hour verification reads 12h 00m, not 11h 59m.
export function formatTimeLeft(ms) {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.max(1, minutes)}m`;
}
