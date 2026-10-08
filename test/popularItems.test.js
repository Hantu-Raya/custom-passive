import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { createLatestPopularRequest, createPopularItemsClient, getPopularItems, popularCacheKey, popularityLabel, popularityWindow, POPULAR_CACHE_TTL_MS, POPULAR_PLAYER_SHARE, validatePopularRows } from '../src/lib/popularItems.js';

const silverRows = JSON.parse(await readFile(new URL('../e2e/fixtures/deadlock-api/item-stats-silver.json', import.meta.url), 'utf8'));
const heroes = JSON.parse(await readFile(new URL('../e2e/fixtures/deadlock-api/heroes.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-08T11:20:00Z');
const item = DEADLOCK_ITEMS[0];
const rawRows = [{ item_id: item.statsId, players: 100 }];
const response = (value, status = 200) => ({ ok: status === 200, status, json: async () => value });
function memoryStorage() {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
function client(options = {}) {
  return createPopularItemsClient({ items: DEADLOCK_ITEMS, storage: memoryStorage(), clock: () => NOW, ...options });
}

// Literal ids are independent of the implementation and include the fresh Sprint Boots row.
test('Silver fixture selects the recorded 800-row ids at the named 22% rule, in name order', () => {
  assert.equal(POPULAR_PLAYER_SHARE, 0.22);
  const popular = getPopularItems(validatePopularRows(silverRows, DEADLOCK_ITEMS), DEADLOCK_ITEMS);
  assert.deepEqual(popular.filter((entry) => entry.tier === 1).map((entry) => entry.id).sort(), [
    'upgrade_close_range', 'upgrade_endurance', 'upgrade_grit', 'upgrade_health',
    'upgrade_improved_stamina', 'upgrade_lifestrike_gauntlets', 'upgrade_medic_bullets', 'upgrade_sprint_booster'
  ]);
  assert.deepEqual(popular.map((entry) => entry.label), popular.map((entry) => entry.label).sort((a, b) => a.localeCompare(b, 'en')));
});

test('boundary validation rejects malformed rows, drops unknown ids and sums duplicates', () => {
  for (const value of [null, {}, [null], [{}], [{ item_id: '1', players: 1 }], [{ item_id: 1.5, players: 1 }], [{ item_id: 1, players: -1 }], [{ item_id: 1, players: 1.2 }]]) {
    assert.throws(() => validatePopularRows(value, DEADLOCK_ITEMS), /Invalid popularity data/);
  }
  assert.deepEqual(validatePopularRows([...rawRows, { item_id: item.statsId, players: 22 }, { item_id: -1, players: 999999 }], DEADLOCK_ITEMS), [{ item_id: item.statsId, players: 122 }]);
  assert.throws(() => validatePopularRows([{ item_id: item.statsId, players: Number.MAX_SAFE_INTEGER }, ...rawRows], DEADLOCK_ITEMS), /overflow/);
});

test('the maximum uses supported catalog items only and the cutoff is inclusive and positive', () => {
  const items = [{ statsId: 1, label: 'A' }, { statsId: 2, label: 'B' }, { statsId: 3, label: 'C' }];
  const rows = [{ item_id: 1, players: 100 }, { item_id: 2, players: 22 }, { item_id: 3, players: 0 }, { item_id: 999, players: 1000000 }];
  assert.deepEqual(getPopularItems(rows, items).map((entry) => entry.label), ['A', 'B']);
  assert.deepEqual(getPopularItems(rows, [items[1], items[2]]).map((entry) => entry.label), ['B']);
});

test('client is lazy, uses the explicit hourly 30-day window and omits hero_id for All heroes', async () => {
  const requests = [];
  const api = client({ fetch: async (url) => { requests.push(url); return response(url.includes('/heroes?') ? heroes : rawRows); } });
  assert.equal(requests.length, 0);
  const window = popularityWindow(NOW);
  assert.equal(window, Math.floor((NOW / 1000 - 30 * 86400) / 3600) * 3600);
  const list = await api.loadHeroes();
  assert.equal(list.find((hero) => hero.id === 80).name, 'Silver');
  assert.equal(list.find((hero) => hero.id === 6).name, 'Abrams');
  await api.loadStats();
  await api.loadStats(80);
  assert.equal(requests[0], 'https://api.deadlock-api.com/v1/assets/heroes?only_active=true');
  const all = new URL(requests[1]);
  assert.equal(all.searchParams.has('hero_id'), false);
  assert.equal(all.searchParams.get('game_mode'), 'normal');
  assert.equal(all.searchParams.get('min_unix_timestamp'), String(window));
  assert.equal(new URL(requests[2]).searchParams.get('hero_id'), '80');
  assert.match(popularityLabel({ minUnixTimestamp: window, fetchedAt: NOW }), /^Popular on deadlock-api\.com since 8 Sep 2026, fetched \d\d:\d\d$/);
});

test('validated raw rows are session-cached with fetch time and shared across clients', async () => {
  const storage = memoryStorage();
  let requests = 0;
  const fetch = async () => { requests += 1; return response([...rawRows, ...rawRows]); };
  const first = await client({ storage, fetch }).loadStats(80);
  const key = popularCacheKey(80, popularityWindow(NOW));
  assert.deepEqual(JSON.parse(storage.getItem(key)), { rows: [{ item_id: item.statsId, players: 200 }], fetchedAt: NOW });
  assert.deepEqual(await client({ storage, fetch }).loadStats(80), first);
  assert.equal(requests, 1);
});

test('malformed caches and throwing sessionStorage are misses rather than failures', async () => {
  const key = popularCacheKey(80, popularityWindow(NOW));
  for (const cache of ['{', JSON.stringify({ fetchedAt: NOW, rows: [{}] }), JSON.stringify({ fetchedAt: 'now', rows: rawRows }), JSON.stringify({ fetchedAt: NOW + 1, rows: rawRows })]) {
    const storage = memoryStorage();
    storage.setItem(key, cache);
    let requests = 0;
    const result = await client({ storage, fetch: async () => { requests += 1; return response(rawRows); } }).loadStats(80);
    assert.deepEqual(result.rows, rawRows);
    assert.equal(requests, 1);
  }
  for (const storage of [() => { throw new Error('blocked'); }, { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } }, { getItem() { return null; }, setItem() { throw new Error('full'); } }]) {
    assert.deepEqual((await client({ storage, fetch: async () => response(rawRows) }).loadStats(80)).rows, rawRows);
  }
});

test('cache expires at ten minutes without advancing the hourly request window', async () => {
  const storage = memoryStorage();
  let now = NOW;
  let requests = 0;
  const api = client({ storage, clock: () => now, fetch: async () => { requests += 1; return response(rawRows); } });
  await api.loadStats(80);
  now += POPULAR_CACHE_TTL_MS - 1;
  await api.loadStats(80);
  assert.equal(requests, 1);
  now += 1;
  await api.loadStats(80);
  assert.equal(requests, 2);
});

test('pending requests are shared per hero and window, and failures are not cached or retried', async () => {
  let resolve;
  let calls = 0;
  const api = client({ fetch: () => { calls += 1; return new Promise((done) => { resolve = done; }); } });
  const a = api.loadStats(80);
  const b = api.loadStats(80);
  assert.equal(a, b);
  assert.equal(calls, 1);
  resolve(response(rawRows, 429));
  await assert.rejects(a, /HTTP 429/);
  assert.equal(calls, 1);
  const next = api.loadStats(80);
  assert.equal(calls, 2);
  resolve(response(rawRows));
  assert.deepEqual((await next).rows, rawRows);
});

test('valid empty data returns no guessed popular items', async () => {
  const data = await client({ fetch: async () => response([]) }).loadStats(80);
  assert.deepEqual(data.rows, []);
  assert.deepEqual(getPopularItems(data.rows, DEADLOCK_ITEMS), []);
});

test('timeout aborts even a stalled fetch and is not failure-cached', async () => {
  let signal;
  let calls = 0;
  const api = client({ timeoutMs: 5, fetch: (_url, options) => { calls += 1; signal = options.signal; return new Promise(() => {}); } });
  await assert.rejects(api.loadStats(80), /timed out/);
  assert.equal(signal.aborted, true);
  await assert.rejects(api.loadStats(80), /timed out/);
  assert.equal(calls, 2);
});

test('hero switch A to B ignores A when it resolves last, and cancellation ignores updates', async () => {
  const resolvers = new Map();
  const api = client({ fetch: (url) => new Promise((resolve) => resolvers.set(new URL(url).searchParams.get('hero_id'), resolve)) });
  const latest = createLatestPopularRequest(api);
  let displayed = null;
  const fail = (error) => { throw error; };
  const a = latest.load(80, (result) => { displayed = result.rows; }, fail);
  const b = latest.load(6, (result) => { displayed = result.rows; }, fail);
  const bRows = [{ item_id: item.statsId, players: 600 }];
  resolvers.get('6')(response(bRows));
  await b;
  resolvers.get('80')(response(rawRows));
  await a;
  assert.deepEqual(displayed, bRows);
  const cancelled = latest.load(null, () => { displayed = []; }, fail);
  latest.cancel();
  resolvers.get(null)(response([]));
  await cancelled;
  assert.deepEqual(displayed, bRows);
});

test('hero requests share pending work, validate ids/names and do not cache failures', async () => {
  let resolve;
  let calls = 0;
  const api = client({ fetch: () => { calls += 1; return new Promise((done) => { resolve = done; }); } });
  const first = api.loadHeroes();
  assert.equal(api.loadHeroes(), first);
  resolve(response([{ id: 80, name: null }]));
  await assert.rejects(first, /Invalid hero data/);
  const next = api.loadHeroes();
  assert.equal(calls, 2);
  resolve(response(heroes));
  await next;
  await api.loadHeroes();
  assert.equal(calls, 2);
});

test('network and invalid-data failures are not cached; invalid hero ids never fetch', async () => {
  for (const fail of [async () => { throw new Error('network unavailable'); }, async () => response([{}])]) {
    let calls = 0;
    const storage = memoryStorage();
    const api = client({ storage, fetch: async () => { calls += 1; return calls === 1 ? fail() : response(rawRows); } });
    await assert.rejects(api.loadStats(80), /network unavailable|Invalid popularity data/);
    assert.equal(storage.getItem(popularCacheKey(80, popularityWindow(NOW))), null);
    await api.loadStats(80);
    assert.equal(calls, 2);
  }
  const api = client({ fetch: () => { throw new Error('must not fetch'); } });
  for (const heroId of ['80', -1, 1.5, NaN]) await assert.rejects(api.loadStats(heroId), /Invalid hero id/);
});
