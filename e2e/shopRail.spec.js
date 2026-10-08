import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { zstdDecompressSync } from 'node:zlib';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { extractArchiveMember } from '../src/lib/archiveExtractor.js';
import { getPopularItems, validatePopularRows } from '../src/lib/popularItems.js';
import { PRESET_TEMPLATE_IDS, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../src/lib/presetTemplates.js';
import { readPassiveFlagTemplate } from '../src/lib/source2PassiveFlags.js';
import { uncompressSource2Resource } from '../src/lib/source2BinaryKv3.js';
import { readVpk } from '../src/lib/vpkReader.js';

const FIXTURE_BASE = new URL('./fixtures/deadlock-api/', import.meta.url);
const HEROES = JSON.parse(await readFile(new URL('heroes.json', FIXTURE_BASE), 'utf8'));
const STATS = Object.fromEntries(await Promise.all(['all', 'silver', 'abrams'].map(async (hero) => [hero, JSON.parse(await readFile(new URL(`item-stats-${hero}.json`, FIXTURE_BASE), 'utf8'))])));
const REQUIRED_TEMPLATE_UPLOAD = process.env.CUSTOM_PASSIVE_TEMPLATE_ARCHIVE
  || `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`;
const STORAGE_KEY = 'custom-passive:selected-items:v2';
const RAIL = [
  ['selected', 'Selected'], ['popular', 'Popular'], ['all', 'All Items'],
  ['weapon', 'Weapon'], ['spirit', 'Spirit'], ['vitality', 'Vitality']
];
const SILVER_IDS = getPopularItems(validatePopularRows(STATS.silver, DEADLOCK_ITEMS), DEADLOCK_ITEMS).map((item) => item.id).sort();

// Every API request is recorded data or an explicit failure, never the live service.
test.beforeEach(async ({ page }) => {
  await page.route('https://api.deadlock-api.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/v1/assets/heroes') {
      expect(url.searchParams.get('only_active')).toBe('true');
      await route.fulfill({ json: HEROES });
    } else if (url.pathname === '/v1/analytics/item-stats') {
      expect(url.searchParams.get('game_mode')).toBe('normal');
      const window = Number(url.searchParams.get('min_unix_timestamp'));
      expect(window % 3600).toBe(0);
      expect(Math.abs(Date.now() / 1000 - 30 * 86400 - window)).toBeLessThan(3601);
      const hero = url.searchParams.get('hero_id');
      expect([null, '80', '6']).toContain(hero);
      await route.fulfill({ json: STATS[hero === '80' ? 'silver' : hero === '6' ? 'abrams' : 'all'] });
    } else {
      await route.abort();
      throw new Error(`Unexpected deadlock-api route: ${url.pathname}`);
    }
  });
});

async function openShop(page) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/custom-passive/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('template-gate')).toBeVisible();
  await page.getByTestId('template-gate-preset').selectOption(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);
  await page.getByTestId('template-gate-file').setInputFiles(REQUIRED_TEMPLATE_UPLOAD);
  await expect(page.getByRole('status')).toContainText(`Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName};`, { timeout: 15000 });
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
}
async function renderedIds(page) {
  return page.locator('.catalog-list-board .item-card').evaluateAll((cards) => cards.map((card) => card.dataset.itemId).sort());
}
async function capture(page, testInfo, name) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath(name), animations: 'disabled' });
}
async function expectFocusRing(locator) {
  await expect(locator).toBeFocused();
  const ring = await locator.evaluate((element) => ({ style: getComputedStyle(element).outlineStyle, width: parseFloat(getComputedStyle(element).outlineWidth) }));
  expect(ring.style).not.toBe('none');
  expect(ring.width).toBeGreaterThanOrEqual(2);
}

test('rail has six stock-order labelled icons, full-length active shape and no startup API traffic', async ({ page }, testInfo) => {
  const apiRequests = [];
  page.on('request', (request) => { if (request.url().startsWith('https://api.deadlock-api.com/')) apiRequests.push(request.url()); });
  await openShop(page);
  expect(apiRequests).toEqual([]);
  const buttons = page.locator('.shop-tabs button');
  await expect(buttons).toHaveCount(6);
  expect(await buttons.evaluateAll((tabs) => tabs.map((tab) => [tab.dataset.testid.replace('tab-', ''), tab.getAttribute('aria-label')]))).toEqual(RAIL);
  for (const [id, label] of RAIL) {
    const tab = page.getByTestId(`tab-${id}`);
    await expect(tab).toHaveAccessibleName(label);
    await expect(tab).toHaveAttribute('title', label);
    const source = await tab.locator('img').getAttribute('src');
    expect(source).toContain('/custom-passive/assets/deadlock/panorama/images/shop/catalog/catalog_shop_tab_icon_');
  }
  const heights = await buttons.evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().height));
  expect(heights[0] / heights[1]).toBeCloseTo(200 / 75, 2);
  await page.getByTestId('tab-all').click();
  expect(await page.getByTestId('tab-all').evaluate((tab) => getComputedStyle(tab, '::before').maskImage)).toContain('catalog_shop_tab_shape_psd.webp');
  await expect(page.locator('.catalog-list-board-all .item-card')).toHaveCount(156);
  await capture(page, testInfo, 'rail.png');
});

test('keyboard traverses every rail tab, Enter activates and Space toggles a focused card', async ({ page }, testInfo) => {
  await openShop(page);
  await page.keyboard.press('Tab');
  await page.getByTestId('tab-selected').focus();
  for (let index = 0; index < RAIL.length; index += 1) {
    const tab = page.getByTestId(`tab-${RAIL[index][0]}`);
    await expectFocusRing(tab);
    await page.keyboard.press('Enter');
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    if (index < RAIL.length - 1) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Tab');
  const firstCard = page.locator('.item-card').first();
  await expectFocusRing(firstCard);
  const before = await firstCard.getAttribute('aria-pressed');
  await page.keyboard.press('Space');
  await expect(firstCard).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await capture(page, testInfo, 'keyboard.png');
});

test('All Items clears its search when leaving and restores all 156 cards on return', async ({ page }, testInfo) => {
  await openShop(page);
  await page.getByTestId('tab-all').click();
  await expect(page.getByTestId('clear-search')).toHaveCount(0);
  await page.getByTestId('search-input').fill('lifesteal');
  await expect(page.getByTestId('clear-search')).toHaveCount(1);
  const clearBounds = await page.getByTestId('clear-search').boundingBox();
  const inputBounds = await page.getByTestId('search-input').boundingBox();
  expect(clearBounds.x).toBeGreaterThanOrEqual(inputBounds.x);
  expect(clearBounds.x + clearBounds.width).toBeLessThanOrEqual(inputBounds.x + inputBounds.width);
  expect(clearBounds.y).toBeGreaterThanOrEqual(inputBounds.y);
  expect(clearBounds.y + clearBounds.height).toBeLessThanOrEqual(inputBounds.y + inputBounds.height);
  expect(await page.locator('.item-card').count()).toBeLessThan(156);
  await page.getByTestId('tab-weapon').click();
  await expect(page.getByTestId('search-input')).toHaveCount(0);
  await page.getByTestId('tab-all').click();
  await expect(page.getByTestId('search-input')).toHaveValue('');
  await expect(page.locator('.catalog-list-board .item-card')).toHaveCount(156);
  await capture(page, testInfo, 'search-cycle.png');
});

test('no matches disables bulk selection and Clear restores cards without changing selection', async ({ page }, testInfo) => {
  await openShop(page);
  await page.getByTestId('clear-selection').click();
  await page.getByTestId('tab-all').click();
  await page.getByTestId('item-card-upgrade_close_range').click();
  await page.getByTestId('item-card-upgrade_health').click();
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await page.getByTestId('search-input').fill('zzzz');
  await expect(page.locator('.tier-board-empty')).toHaveText('No matching items');
  await expect(page.locator('.item-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select all shown' })).toBeDisabled();
  await page.getByTestId('clear-search').click();
  await expect(page.getByTestId('search-input')).toHaveValue('');
  await expect(page.getByTestId('clear-search')).toHaveCount(0);
  await expect(page.locator('.item-card')).toHaveCount(156);
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await capture(page, testInfo, 'no-match-clear.png');
});

test('Popular uses recorded Silver data without changing selection; toggle and bulk select exactly its ids', async ({ page }, testInfo) => {
  await openShop(page);
  await page.getByTestId('clear-selection').click();
  await page.getByTestId('tab-popular').click();
  await page.getByTestId('popular-hero-select').selectOption('80');
  await expect.poll(() => renderedIds(page)).toEqual(SILVER_IDS);
  const tierOne = await page.locator('.tier-board-row[data-tier="1"] .item-card').evaluateAll((cards) => cards.map((card) => card.dataset.itemId).sort());
  expect(tierOne).toEqual(['upgrade_close_range', 'upgrade_endurance', 'upgrade_grit', 'upgrade_health', 'upgrade_improved_stamina', 'upgrade_lifestrike_gauntlets', 'upgrade_medic_bullets', 'upgrade_sprint_booster']);
  await expect(page.getByTestId('selected-count')).toHaveText('0');
  await expect(page.locator('.popular-controls')).toContainText('Popular on deadlock-api.com since');
  await capture(page, testInfo, 'popular-silver.png');
  await page.locator('.item-card').first().click();
  await expect(page.getByTestId('selected-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await expect(page.getByTestId('selected-count')).toHaveText(String(SILVER_IDS.length));
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)).toEqual(SILVER_IDS);
  await page.getByTestId('popular-hero-select').selectOption('6');
  const abramsIds = getPopularItems(validatePopularRows(STATS.abrams, DEADLOCK_ITEMS), DEADLOCK_ITEMS).map((item) => item.id).sort();
  await expect.poll(() => renderedIds(page)).toEqual(abramsIds);
  await expect(page.getByTestId('selected-count')).toHaveText(String(SILVER_IDS.length));
});

test('Popular failure never guesses cards and browser build/download still preserves exact selections', async ({ page }, testInfo) => {
  await page.route('https://api.deadlock-api.com/**', (route) => route.abort());
  await openShop(page);
  await page.getByTestId('clear-selection').click();
  await page.getByTestId('tab-all').click();
  const ids = ['upgrade_close_range', 'upgrade_health', 'upgrade_medic_bullets'].sort();
  for (const id of ids) await page.getByTestId(`item-card-${id}`).click();
  await page.getByTestId('tab-popular').click();
  await expect(page.locator('.tier-board-empty')).toHaveText('Popularity data unavailable');
  await expect(page.getByRole('status')).toContainText('unavailable');
  await expect(page.locator('.item-card')).toHaveCount(0);
  await expect(page.getByTestId('selected-count')).toHaveText('3');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('build-download').click();
  const download = await downloadPromise;
  const preset = getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);
  expect(download.suggestedFilename()).toBe(preset.archiveOutputFileName);
  const bytes = new Uint8Array(await readFile(await download.path()));
  const vpk = await extractArchiveMember(bytes, 'download.7z', preset.outputFileName);
  const files = readVpk(vpk);
  expect(files.map((file) => file.path)).toEqual(['scripts/abilities.vdata_c']);
  const data = uncompressSource2Resource(files[0].bytes, { decompressZstd: zstdDecompressSync });
  expect([...readPassiveFlagTemplate(data, DEADLOCK_ITEMS.map((item) => item.id)).selectedItemIds].sort()).toEqual(ids);
  await expect(page.getByRole('status')).toContainText('Built');
  await capture(page, testInfo, 'popular-offline.png');
});

test('valid empty Popular data has a distinct empty state', async ({ page }) => {
  await page.route('https://api.deadlock-api.com/v1/analytics/item-stats?**', (route) => route.fulfill({ json: [] }));
  await openShop(page);
  await page.getByTestId('tab-popular').click();
  await expect(page.locator('.tier-board-empty')).toHaveText('No popularity data for this hero yet');
  await expect(page.locator('.item-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select all shown' })).toBeDisabled();
});

test('sorted selections persist across reload independently of Popular requests', async ({ page }, testInfo) => {
  await openShop(page);
  await page.getByTestId('clear-selection').click();
  await page.getByTestId('tab-all').click();
  const ids = ['upgrade_medic_bullets', 'upgrade_close_range', 'upgrade_health'].sort();
  for (const id of ids) await page.getByTestId(`item-card-${id}`).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)).toEqual(ids);
  await page.reload();
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
  await expect(page.getByTestId('selected-count')).toHaveText('3');
  await expect.poll(() => renderedIds(page)).toEqual(ids);
  for (const id of ids) await expect(page.getByTestId(`item-card-${id}`)).toHaveAttribute('aria-pressed', 'true');
  await capture(page, testInfo, 'persist.png');
});
