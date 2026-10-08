export const POPULAR_PLAYER_SHARE = 0.22;
export const POPULAR_CACHE_TTL_MS = 10 * 60 * 1000;
export const POPULAR_TIMEOUT_MS = 8000;
const API_BASE = 'https://api.deadlock-api.com/v1';
const CACHE_PREFIX = 'custom-passive:popular:v1:';

export function popularityWindow(now = Date.now()) {
  return Math.floor((now / 1000 - 30 * 24 * 60 * 60) / 3600) * 3600;
}

export function popularCacheKey(heroId, minUnixTimestamp) {
  return `${CACHE_PREFIX}${heroId ?? 'all'}:${minUnixTimestamp}`;
}

export function validatePopularRows(value, items) {
  if (!Array.isArray(value)) throw new Error('Invalid popularity data: expected an array.');
  const knownIds = new Set(items.map((item) => item.statsId));
  const playersById = new Map();
  for (const row of value) {
    if (!row || !Number.isSafeInteger(row.item_id) || !Number.isSafeInteger(row.players) || row.players < 0) {
      throw new Error('Invalid popularity data: item_id and players must be integers, with players non-negative.');
    }
    if (!knownIds.has(row.item_id)) continue;
    const players = (playersById.get(row.item_id) || 0) + row.players;
    if (!Number.isSafeInteger(players)) throw new Error('Invalid popularity data: player count overflow.');
    playersById.set(row.item_id, players);
  }
  return [...playersById].map(([item_id, players]) => ({ item_id, players }));
}

export function getPopularItems(rows, items) {
  const playersById = new Map(rows.map((row) => [row.item_id, row.players]));
  const maximum = Math.max(0, ...items.map((item) => playersById.get(item.statsId) || 0));
  return items.filter((item) => {
    const players = playersById.get(item.statsId) || 0;
    return players > 0 && players >= maximum * POPULAR_PLAYER_SHARE;
  }).sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

export function createPopularItemsClient({ items, fetch: fetchImpl = globalThis.fetch, storage = () => globalThis.sessionStorage, clock = Date.now, timeoutMs = POPULAR_TIMEOUT_MS } = {}) {
  const pending = new Map();
  let heroes = null;
  const getStorage = () => typeof storage === 'function' ? storage() : storage;

  async function request(url) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { signal: controller.signal });
          if (!response.ok) throw new Error(`deadlock-api.com returned HTTP ${response.status}.`);
          return response.json();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('deadlock-api.com request timed out after 8 seconds.'));
          }, timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  function share(key, load) {
    if (!pending.has(key)) {
      const promise = load().finally(() => pending.delete(key));
      pending.set(key, promise);
    }
    return pending.get(key);
  }

  function loadHeroes() {
    if (heroes) return Promise.resolve(heroes);
    return share('heroes', async () => {
      const value = await request(`${API_BASE}/assets/heroes?only_active=true`);
      if (!Array.isArray(value) || value.some((hero) => !hero || !Number.isSafeInteger(hero.id) || hero.id < 0 || typeof hero.name !== 'string' || !hero.name.trim())) {
        throw new Error('Invalid hero data from deadlock-api.com.');
      }
      heroes = [...new Map(value.map(({ id, name }) => [id, { id, name }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
      return heroes;
    });
  }

  function loadStats(heroId = null) {
    if (heroId !== null && (!Number.isSafeInteger(heroId) || heroId < 0)) return Promise.reject(new Error('Invalid hero id.'));
    const minUnixTimestamp = popularityWindow(clock());
    const key = popularCacheKey(heroId, minUnixTimestamp);
    try {
      const cached = JSON.parse(getStorage()?.getItem(key) || 'null');
      const age = clock() - cached?.fetchedAt;
      if (Number.isFinite(cached?.fetchedAt) && age >= 0 && age < POPULAR_CACHE_TTL_MS) {
        return Promise.resolve({ rows: validatePopularRows(cached.rows, items), fetchedAt: cached.fetchedAt, minUnixTimestamp });
      }
    } catch {
      // Unavailable storage or malformed cached data is a miss, never a failed view.
    }
    return share(key, async () => {
      const params = new URLSearchParams({ game_mode: 'normal', min_unix_timestamp: String(minUnixTimestamp) });
      if (heroId !== null) params.set('hero_id', String(heroId));
      const rows = validatePopularRows(await request(`${API_BASE}/analytics/item-stats?${params}`), items);
      const fetchedAt = clock();
      try {
        getStorage()?.setItem(key, JSON.stringify({ rows, fetchedAt }));
      } catch {
        // Popular remains usable when session storage is blocked or full.
      }
      return { rows, fetchedAt, minUnixTimestamp };
    });
  }

  return { loadHeroes, loadStats };
}

// A view may ignore old requests without aborting another consumer's shared fetch.
export function createLatestPopularRequest(client) {
  let generation = 0;
  return {
    async load(heroId, onResult, onError) {
      const current = ++generation;
      try {
        const result = await client.loadStats(heroId);
        if (current === generation) onResult(result);
      } catch (error) {
        if (current === generation) onError(error);
      }
    },
    cancel() { generation += 1; }
  };
}

const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
const twoDigits = (value) => String(value).padStart(2, '0');

// Formatted by hand: ICU month abbreviations differ between runtimes (e.g. "Sep" vs "Sept").
export function popularityLabel({ minUnixTimestamp, fetchedAt }) {
  const since = new Date(minUnixTimestamp * 1000);
  const fetched = new Date(fetchedAt);
  return `Popular on deadlock-api.com since ${since.getDate()} ${MONTHS[since.getMonth()]} ${since.getFullYear()}, fetched ${twoDigits(fetched.getHours())}:${twoDigits(fetched.getMinutes())}`;
}
