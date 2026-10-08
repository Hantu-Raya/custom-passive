import { expect, test } from '@playwright/test';
import { DEADLOCK_ITEMS, TIER_COSTS } from '../src/data/deadlockItems.generated.js';
import { PRESET_TEMPLATE_IDS, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../src/lib/presetTemplates.js';
import { CATEGORY_TIER_COLUMNS } from '../src/lib/tierBoard.js';
import { expectRectNear, loadReferenceAnchors, rectOf } from './helpers/shopGeometry.js';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.deadlock-api.com/**', (route) => route.abort());
});

const ANCHORS = loadReferenceAnchors();
const REQUIRED_TEMPLATE_UPLOAD = process.env.CUSTOM_PASSIVE_TEMPLATE_ARCHIVE
  || `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`;
const centre = ({ x, y, w, h }) => ({ x: x + w / 2, y: y + h / 2 });
const normalise = (point, origin, unit) => ({ x: (point.x - origin.x) / unit, y: (point.y - origin.y) / unit });

async function openShop(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/custom-passive/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('template-gate')).toBeVisible();
  await page.getByTestId('template-gate-preset').selectOption(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);
  await page.getByTestId('template-gate-file').setInputFiles(REQUIRED_TEMPLATE_UPLOAD);
  await expect(page.getByRole('status')).toContainText(`Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).label}`, { timeout: 15000 });
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
}

async function readCategory(page, category, minimumWidth = 0) {
  await page.getByTestId(`tab-${category}`).click();
  await page.mouse.move(0, 0);
  const items = DEADLOCK_ITEMS.filter((item) => item.category === category);
  const board = await rectOf(page, '.catalog-board');
  await expect(page.locator('.catalog-board .item-card')).toHaveCount(items.length);
  const cards = await page.locator('.catalog-board .item-card').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    const icon = element.querySelector('.item-icon').getBoundingClientRect();
    return {
      id: element.dataset.itemId,
      tier: Number(element.closest('.tier-section').dataset.tier),
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      icon: { x: icon.x, y: icon.y, w: icon.width, h: icon.height }
    };
  }));
  expect(cards.map((card) => card.id).sort(), `${category}: complete, distinct catalog`).toEqual(items.map((item) => item.id).sort());
  for (const item of items) await expect(page.getByTestId(`item-card-${item.id}`), `${item.label}: rendered exactly once`).toHaveCount(1);
  for (const card of cards) {
    expect(card.rect.x, `${card.id}: left inside board`).toBeGreaterThanOrEqual(board.x - 1);
    expect(card.rect.y, `${card.id}: top inside board`).toBeGreaterThanOrEqual(board.y - 1);
    expect(card.rect.x + card.rect.w, `${card.id}: right inside board`).toBeLessThanOrEqual(board.x + board.w + 1);
    expect(card.rect.y + card.rect.h, `${card.id}: bottom inside board`).toBeLessThanOrEqual(board.y + board.h + 1);
    expect(card.rect.w, `${card.id}: tappable card width`).toBeGreaterThanOrEqual(minimumWidth);
  }
  return cards;
}

for (const category of Object.keys(CATEGORY_TIER_COLUMNS)) {
  test(`${category} uses the stock tier regions, columns, prices and in-game card positions`, async ({ page }) => {
    await openShop(page, { width: 1600, height: 900 });
    const cards = await readCategory(page, category);
    expect(await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('700 28px VALVEPulp') && document.fonts.check('500 12px VALVEOracle');
    }), `${category}: stock shop fonts loaded`).toBe(true);
    await expect(page.locator('.catalog-board .item-name').first()).toHaveCSS('font-family', /^VALVEOracle(?:,|$)/);
    await expect(page.locator('.catalog-board .item-name').first()).toHaveCSS('font-weight', '500');
    expect(await page.locator('.catalog-board .item-name-text').evaluateAll((names) => names.every((name) => {
      return [...name.textContent.matchAll(/[^\s-]+/g)].every((word) => {
        const range = document.createRange();
        range.setStart(name.firstChild, word.index);
        range.setEnd(name.firstChild, word.index + word[0].length);
        return range.getClientRects().length === 1;
      });
    })), `${category}: names wrap between words without orphan letters`).toBe(true);
    const capture = ANCHORS.captures[`tab_${category}`];
    const firstRow = cards.filter((card) => card.tier === 1).sort((a, b) => a.icon.y - b.icon.y || a.icon.x - b.icon.x);
    const anchorFirstRow = capture.cards.filter((card) => DEADLOCK_ITEMS.find((item) => item.id === card.id)?.tier === 1)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const origin = centre(firstRow[0].icon);
    const unit = centre(firstRow[1].icon).x - origin.x;
    const anchorOrigin = centre(capture.tiers['1'].firstCard);
    const anchorUnit = centre(anchorFirstRow[1]).x - centre(anchorFirstRow[0]).x;
    expect(unit, `${category}: positive horizontal card pitch`).toBeGreaterThan(0);
    expect(anchorUnit, `${category}: positive reference pitch`).toBeGreaterThan(0);
    for (const card of cards) {
      const anchor = capture.cards.find((candidate) => candidate.id === card.id);
      expect(anchor, `${card.id}: in-game reference icon`).toBeTruthy();
      const actual = normalise(centre(card.icon), origin, unit);
      const expected = normalise(centre(anchor), anchorOrigin, anchorUnit);
      expectRectNear({ ...actual, w: 0, h: 0 }, { ...expected, w: 0, h: 0 }, 0.15, `${category}: ${card.id}`);
    }
    for (const tier of [1, 2, 3, 4]) {
      const tierCards = cards.filter((card) => card.tier === tier);
      const firstY = Math.min(...tierCards.map((card) => card.icon.y));
      expect(tierCards.filter((card) => Math.abs(card.icon.y - firstY) < 1).length, `${category}: tier ${tier} first-row columns`).toBe(CATEGORY_TIER_COLUMNS[category][tier]);
      const tierRegion = page.locator(`.tier-section[data-tier="${tier}"]`);
      await expect(tierRegion.locator('.tier-price-label')).toHaveText(String(TIER_COSTS[tier]));
      await expect(tierRegion.locator('.tier-price-label')).toBeVisible();
      await expect(tierRegion.locator('.tier-price-label')).toHaveCSS('font-family', /^VALVEPulp(?:,|$)/);
      await expect(tierRegion.locator('.tier-price-label')).toHaveCSS('color', 'rgb(153, 255, 214)');
      await expect(tierRegion.locator('.tier-price')).toHaveText(String(TIER_COSTS[tier]));
      await expect(tierRegion.locator('.tier-price-sticker, .tier-price-currency')).toHaveCount(0);
    }
  });
}

test('category boards keep every item inside the board at 1280x720 with cards at least 40px wide', async ({ page }) => {
  await openShop(page, { width: 1280, height: 720 });
  for (const category of Object.keys(CATEGORY_TIER_COLUMNS)) await readCategory(page, category, 40);
});
