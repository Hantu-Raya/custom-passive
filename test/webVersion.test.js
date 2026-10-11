import assert from 'node:assert/strict';
import test from 'node:test';
import { GAMEBANANA_MOD_SOURCE } from '../src/data/gamebananaSources.generated.js';
import {
  WEB_VERSION,
  WEB_VERSION_FILE,
  fetchDeployedWebVersion,
  formatBatch,
  formatTimeLeft,
  isNewerWebVersion,
  parseWebVersion
} from '../src/lib/webVersion.js';

const DEPLOYED = Object.freeze({ buildId: 'abc1234-2026-10-12T00:00:00.000Z', commit: 'abc1234', builtAt: '2026-10-12T00:00:00.000Z', batch: '10_12' });

test('web version reports the synced GameBanana batch and is frozen', () => {
  assert.equal(WEB_VERSION.batch, GAMEBANANA_MOD_SOURCE.batchDateTag);
  assert.equal(WEB_VERSION.buildId, 'local');
  assert.ok(Object.isFrozen(WEB_VERSION));
});

test('deployed version check bypasses caches and validates the response', async () => {
  const calls = [];
  const deployed = await fetchDeployedWebVersion({
    now: 123,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => DEPLOYED };
    }
  });
  assert.deepEqual(deployed, DEPLOYED);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `/${WEB_VERSION_FILE}?t=123`);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(isNewerWebVersion(WEB_VERSION, deployed), true);
  assert.equal(isNewerWebVersion(WEB_VERSION, WEB_VERSION), false);
});

test('deployed version check surfaces HTTP and shape errors', async () => {
  await assert.rejects(
    fetchDeployedWebVersion({ fetchImpl: async () => ({ ok: false, status: 404 }) }),
    /HTTP 404/
  );
  assert.throws(() => parseWebVersion({ ...DEPLOYED, buildId: '' }), /missing buildId/);
  assert.throws(() => parseWebVersion(null), /not an object/);
});

test('version labels format batches and remaining verification time', () => {
  assert.equal(formatBatch('10_10'), '10/10');
  assert.equal(formatTimeLeft(11 * 3600e3 + 5 * 60e3), '11h 05m');
  assert.equal(formatTimeLeft(30e3), '1m');
  assert.equal(formatTimeLeft(12 * 3600e3 - 5), '12h 00m');
  assert.equal(formatTimeLeft(11 * 3600e3 + 5 * 60e3 + 1), '11h 06m');
});
