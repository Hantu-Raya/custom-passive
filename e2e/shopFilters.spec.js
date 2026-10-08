import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PRESET_TEMPLATE_IDS, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../src/lib/presetTemplates.js';

const oracle = JSON.parse(await readFile(new URL('../test/fixtures/shop-filter-oracle.json', import.meta.url), 'utf8'));
const REQUIRED_TEMPLATE_UPLOAD = process.env.CUSTOM_PASSIVE_TEMPLATE_ARCHIVE
  || `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`;
const slug = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function renderedIds(page) {
  return page.locator('.catalog-list-board .item-card').evaluateAll((cards) => cards.map((card) => card.dataset.itemId).sort());
}

async function expectIds(page, ids) {
  await expect.poll(() => renderedIds(page)).toEqual([...ids].sort());
}

async function choose(page, id, button = 'left') {
  await page.getByTestId(`filter-category-${slug(id.split('/')[0])}`).hover();
  const option = page.getByTestId(`filter-option-${slug(id)}`);
  await expect(option).toBeVisible();
  await option.click({ button });
  await option.press('Escape');
}

async function capture(page, testInfo, name) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://api.deadlock-api.com/**', (route) => route.abort());
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/custom-passive/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('template-gate')).toBeVisible();
  await page.getByTestId('template-gate-preset').selectOption(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);
  await page.getByTestId('template-gate-file').setInputFiles(REQUIRED_TEMPLATE_UPLOAD);
  await expect(page.getByRole('status')).toContainText(`Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).label}`, { timeout: 15000 });
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
  await page.getByTestId('tab-all').click();
  await expect(page.locator('.catalog-list-board .item-card')).toHaveCount(156);
});

test('single filters replace, right click ORs, breadcrumbs remove and Clear restores the catalog', async ({ page }, testInfo) => {
  await page.getByTestId('filter-category-physical').hover();
  await expect(page.getByRole('menu', { name: 'Physical filters' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('menu-physical.png') });
  await choose(page, 'Physical/Ammo');
  await expectIds(page, oracle.filters['Physical/Ammo']);
  await expect(page.getByTestId('active-filter-physical-ammo')).toBeVisible();
  await capture(page, testInfo, 'ammo');

  await choose(page, 'Physical/Fire Rate');
  await expectIds(page, oracle.filters['Physical/Fire Rate']);
  await expect(page.getByTestId('active-filter-physical-ammo')).toHaveCount(0);
  await expect(page.getByTestId('active-filter-physical-fire-rate')).toBeVisible();
  await capture(page, testInfo, 'replace');

  await choose(page, 'Physical/Weapon Damage');
  await choose(page, 'Defense/HP', 'right');
  const union = [...new Set([...oracle.filters['Physical/Weapon Damage'], ...oracle.filters['Defense/HP']])];
  expect(union).toHaveLength(71);
  await expectIds(page, union);
  await expect(page.getByTestId('active-filters').getByText('OR', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'or');

  const board = await page.locator('.catalog-list-board').boundingBox();
  const active = await page.getByTestId('active-filters').boundingBox();
  expect(Math.abs(active.y + active.height - board.y - board.height)).toBeLessThanOrEqual(1);
  await page.getByTestId('active-filter-defense-hp').click();
  await expectIds(page, oracle.filters['Physical/Weapon Damage']);
  await expect(page.locator('.active-filter-or')).toHaveCount(0);
  await capture(page, testInfo, 'breadcrumb');

  await page.getByTestId('clear-filters').click();
  await expect(page.locator('.catalog-list-board .item-card')).toHaveCount(156);
  await expect(page.getByTestId('active-filters')).toHaveCount(0);
  await capture(page, testInfo, 'clear');
});

test('hover switches directly after clicking a filter, then right click adds the next category with OR', async ({ page }) => {
  await page.getByTestId('filter-category-physical').hover();
  await page.getByTestId('filter-option-physical-weapon-damage').click();
  await expect(page.getByRole('menu', { name: 'Physical filters' })).toBeVisible();
  await expectIds(page, oracle.filters['Physical/Weapon Damage']);

  await page.getByTestId('filter-category-defense').hover();
  await expect(page.getByRole('menu', { name: 'Defense filters' })).toBeVisible();
  await expect(page.getByRole('menu', { name: 'Physical filters' })).toHaveCount(0);
  await expect(page.getByTestId('filter-category-defense')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('filter-option-defense-hp').click({ button: 'right' });
  const union = [...new Set([...oracle.filters['Physical/Weapon Damage'], ...oracle.filters['Defense/HP']])];
  expect(union).toHaveLength(71);
  await expectIds(page, union);
  await expect(page.getByTestId('active-filter-physical-weapon-damage')).toBeVisible();
  await expect(page.getByTestId('active-filter-defense-hp')).toBeVisible();
  await expect(page.locator('.active-filter-or')).toHaveText('OR');
});

test('mouse-used menus close on pointer leave after a selection, while keyboard menus stay open', async ({ page }) => {
  const category = page.getByTestId('filter-category-physical');
  const menu = page.getByRole('menu', { name: 'Physical filters' });
  await category.hover();
  await page.getByTestId('filter-option-physical-ammo').click();
  await expect(menu).toBeVisible();
  const board = await page.locator('.catalog-list-board').boundingBox();
  await page.mouse.move(board.x + board.width - 10, board.y + board.height - 10);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByTestId('active-filter-physical-ammo')).toBeVisible();
  await expectIds(page, oracle.filters['Physical/Ammo']);

  await category.hover();
  await category.focus();
  await expect(menu).toBeVisible();
  await page.mouse.move(board.x + board.width - 10, board.y + board.height - 10);
  await expect(menu).toBeVisible();
  await category.press('Escape');
  await expect(menu).toHaveCount(0);
  await expectIds(page, oracle.filters['Physical/Ammo']);
});

test('filter groups, search intersection, leaving All Items and bulk selection share the rendered ids', async ({ page }, testInfo) => {
  await choose(page, 'Physical/Gun Improvements');
  await expectIds(page, oracle.filters['Physical/Gun Improvements']);
  await choose(page, 'Disruption/Reductions');
  await expectIds(page, oracle.filters['Disruption/Reductions']);
  await choose(page, 'Physical/Weapon Damage');
  await page.getByTestId('search-input').fill('lifesteal');
  await expectIds(page, ['upgrade_vampire']);
  await capture(page, testInfo, 'filter-search');

  await page.getByTestId('clear-selection').click();
  const shown = await renderedIds(page);
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await expect(page.getByTestId('selected-count')).toHaveText(String(shown.length));
  await page.getByTestId('tab-selected').click();
  await expectIds(page, shown);
  await page.getByTestId('tab-all').click();
  await expect(page.getByTestId('search-input')).toHaveValue('');
  await expect(page.getByTestId('active-filters')).toHaveCount(0);
  await expect(page.locator('.catalog-list-board .item-card')).toHaveCount(156);

  await choose(page, 'Physical/Ammo');
  await page.getByTestId('clear-selection').click();
  const ammo = await renderedIds(page);
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await expect(page.getByTestId('selected-count')).toHaveText(String(ammo.length));
  await page.getByTestId('tab-selected').click();
  await expectIds(page, ammo);
});

test('every category supports focus, arrow navigation and Escape; Ctrl+Enter adds with OR', async ({ page }, testInfo) => {
  await page.mouse.move(0, 0);
  for (const category of ['Physical', 'Spirit', 'Defense', 'Mobility', 'Disruption', 'Misc']) {
    const button = page.getByTestId(`filter-category-${slug(category)}`);
    await button.focus();
    const menu = page.getByRole('menu', { name: `${category} filters` });
    await expect(menu).toBeVisible();
    const options = menu.getByRole('menuitemcheckbox');
    await button.press('ArrowDown');
    await expect(options.first()).toBeFocused();
    await options.first().press('ArrowDown');
    await expect(options.nth(1)).toBeFocused();
    await options.nth(1).press('ArrowUp');
    await expect(options.first()).toBeFocused();
    await options.first().press('End');
    await expect(options.last()).toBeFocused();
    await options.last().press('Home');
    await expect(options.first()).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`keyboard-${slug(category)}.png`) });
    await options.first().press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  }
  await page.getByTestId('filter-category-physical').focus();
  await page.getByTestId('filter-option-physical-weapon-damage').focus();
  await page.getByTestId('filter-option-physical-weapon-damage').press('Enter');
  await expectIds(page, oracle.filters['Physical/Weapon Damage']);
  await page.getByTestId('filter-category-defense').focus();
  await page.getByTestId('filter-option-defense-hp').focus();
  await page.getByTestId('filter-option-defense-hp').press('Control+Enter');
  await expectIds(page, [...new Set([...oracle.filters['Physical/Weapon Damage'], ...oracle.filters['Defense/HP']])]);
  await expect(page.locator('.active-filter-or')).toHaveText('OR');
  await page.getByTestId('search-input').focus();
  await expect(page.getByRole('menu', { name: 'Defense filters' })).toHaveCount(0);
  await page.getByTestId('filter-category-physical').focus();
  await expect(page.getByRole('menu', { name: 'Physical filters' })).toBeVisible();
  await page.getByTestId('tab-all').focus();
  await expect(page.getByRole('menu', { name: 'Physical filters' })).toHaveCount(0);
});

test.describe('touch menus', () => {
  test.use({ hasTouch: true });
  test('tap opens and toggles a category without hover and tap selects a leaf', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const category = page.getByTestId('filter-category-physical');
    await category.tap();
    await expect(page.getByRole('menu', { name: 'Physical filters' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('filter-touch.png') });
    await category.tap();
    await expect(page.getByRole('menu', { name: 'Physical filters' })).toHaveCount(0);
    await category.tap();
    await expect(page.getByRole('menu', { name: 'Physical filters' })).toBeVisible();
    await page.getByTestId('tab-all').tap();
    await expect(page.getByRole('menu', { name: 'Physical filters' })).toHaveCount(0);
    await category.tap();
    await page.getByTestId('filter-option-physical-ammo').tap();
    await expectIds(page, oracle.filters['Physical/Ammo']);
    await page.getByTestId('search-input').tap();
    await expect(page.getByRole('menu', { name: 'Physical filters' })).toHaveCount(0);
  });
});
