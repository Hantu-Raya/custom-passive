import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DEADLOCK_ITEMS, TIER_COSTS } from '../src/data/deadlockItems.generated.js';
import { SHOP_LAYOUT } from '../src/data/shopLayout.generated.js';
import { PRESET_TEMPLATE_IDS, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../src/lib/presetTemplates.js';
import { TIER_BOARD_CATEGORIES, TIER_BOARD_COLUMNS, TIER_BOARD_TIERS } from '../src/lib/tierBoard.js';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.deadlock-api.com/**', (route) => route.abort());
});

const COUNTS = {
  weapon: [7, 16, 19, 11],
  spirit: [8, 12, 13, 16],
  vitality: [8, 15, 14, 17]
};
const REQUIRED_TEMPLATE_UPLOAD = process.env.CUSTOM_PASSIVE_TEMPLATE_ARCHIVE
  || `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`;

async function openShop(page, viewport = { width: 1600, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.goto('/custom-passive/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('template-gate')).toBeVisible();
  await page.getByTestId('template-gate-preset').selectOption(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);
  await page.getByTestId('template-gate-file').setInputFiles(REQUIRED_TEMPLATE_UPLOAD);
  await expect(page.getByRole('status')).toContainText(`Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).label}`, { timeout: 15000 });
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
}

async function selectAllItems(page) {
  await page.getByTestId('clear-selection').click();
  for (const category of TIER_BOARD_CATEGORIES) {
    await page.getByTestId(`tab-${category}`).click();
    await page.getByRole('button', { name: 'Select all shown' }).click();
  }
  await expect(page.getByTestId('selected-count')).toHaveText('156');
  await page.getByTestId('tab-selected').click();
  await page.mouse.move(0, 0);
}

async function renderedIds(page) {
  return page.locator('.catalog-list-board .item-card').evaluateAll((cards) => cards.map((card) => card.dataset.itemId).sort());
}

async function expectFirstTierSpacing(page) {
  const spacing = await page.locator('.catalog-list-board').evaluate((board) => {
    const header = board.querySelector('.tier-board-header').getBoundingClientRect();
    const row = board.querySelector('.tier-board-row[data-tier="1"]');
    const price = row.querySelector('.tier-board-price').getBoundingClientRect();
    const card = row.querySelector('.item-hover-frame').getBoundingClientRect();
    const ruleY = price.top + price.height / 2;
    const referenceScale = 950 / board.getBoundingClientRect().width;
    const nextPrice = board.querySelector('.tier-board-row[data-tier="2"] .tier-board-price').getBoundingClientRect();
    const lastCardBottom = Math.max(...[...row.querySelectorAll('.item-hover-frame')].map((frame) => frame.getBoundingClientRect().bottom));
    return {
      kind: board.classList.contains('catalog-list-board-popular') ? 'popular' : board.classList.contains('catalog-list-board-all') ? 'all' : 'selected',
      referenceScale,
      headerToRule: (ruleY - header.bottom) * referenceScale,
      ruleToCard: (card.top - ruleY) * referenceScale,
      cardToNextRule: (nextPrice.top + nextPrice.height / 2 - lastCardBottom) * referenceScale
    };
  });
  const stockToReference = 950 / (SHOP_LAYOUT.mainPanel.width - 75 - 20);
  // Recommended omits Filtered's 30px CostLabel padding; both retain the
  // 3px card margin + 10px tier padding + 6px list padding + 3px list margin.
  const headerToRule = spacing.kind === 'popular' ? 45 - 30 * stockToReference : 45;
  const gapStock = spacing.kind === 'popular' ? 26 : spacing.kind === 'all' ? 56 : 76 * 0.85;
  expect(Math.abs(spacing.headerToRule - headerToRule), 'reference-scaled header-to-first-price spacing').toBeLessThanOrEqual(1);
  expect(Math.abs(spacing.cardToNextRule - (gapStock * stockToReference + 12 * spacing.referenceScale)), 'stock-derived last-card-to-next-price spacing').toBeLessThanOrEqual(1);
  expect(Math.abs(spacing.ruleToCard - 18), 'reference-scaled first-price-to-card spacing').toBeLessThanOrEqual(1);
}

async function expectReferenceColumns(page) {
  const geometry = await page.locator('.catalog-list-board').evaluate((board) => {
    const bounds = board.getBoundingClientRect();
    const header = board.querySelector('.tier-board-header').getBoundingClientRect();
    const columns = ['weapon', 'spirit', 'vitality'].map((category) => {
      const icon = board.querySelector(`.tier-board-cell[data-category="${category}"] .item-icon`);
      const cell = icon.closest('.tier-board-cell').getBoundingClientRect();
      return { icon: (icon.getBoundingClientRect().left - bounds.left) / bounds.width, cellLeft: cell.left, cellWidth: cell.width };
    });
    return { left: (header.left - bounds.left) / bounds.width, right: (bounds.right - header.right) / bounds.width, headerLeft: header.left, headerWidth: header.width, columns };
  });
  const referenceFirstIcons = [(555 - 532) / 925, (854 - 532) / 925, (1153 - 532) / 925];
  for (const [index, column] of geometry.columns.entries()) {
    expect(Math.abs(column.icon - referenceFirstIcons[index]), `${index}: first icon reference-normalized x`).toBeLessThanOrEqual(0.01);
    expect(Math.abs(column.cellLeft - geometry.headerLeft - index * geometry.headerWidth / 3), `${index}: header and cell left alignment`).toBeLessThanOrEqual(1);
    expect(Math.abs(column.cellWidth - geometry.headerWidth / 3), `${index}: header and cell width alignment`).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(geometry.left - 16 / 925), 'stock header left inset').toBeLessThanOrEqual(0.01);
  expect(Math.abs(geometry.right - 11 / 925), 'stock header right inset').toBeLessThanOrEqual(0.01);
}

async function expectPriceLabelsVisible(page) {
  const scroller = page.locator('.tier-board-scroller');
  const initialScrollTop = await scroller.evaluate((element) => element.scrollTop);
  const prices = page.locator('.tier-board-row .tier-board-price');
  for (let index = 0; index < await prices.count(); index += 1) {
    const price = prices.nth(index);
    await price.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(price).toBeVisible();
    const geometry = await price.evaluate((element) => {
      const board = element.closest('.catalog-list-board').getBoundingClientRect();
      const scroller = element.closest('.tier-board-scroller');
      const frame = scroller.getBoundingClientRect();
      const header = scroller.querySelector('.tier-board-header').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const hit = document.elementFromPoint(text.left + 1, (text.top + text.bottom) / 2);
      return { labelLeft: element.getBoundingClientRect().left, boardLeft: board.left, boardWidth: board.width, frameRight: frame.right, frameBottom: frame.bottom, headerBottom: header.bottom, textLeft: text.left, textRight: text.right, textTop: text.top, textBottom: text.bottom, unobscured: hit === element || element.contains(hit) };
    });
    expect(geometry.labelLeft, `${index}: price label inset`).toBeGreaterThanOrEqual(geometry.boardLeft + 8);
    expect(Math.abs((geometry.labelLeft - geometry.boardLeft) / geometry.boardWidth - 13 / 925), `${index}: stock price inset`).toBeLessThanOrEqual(0.005);
    expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.boardLeft + 8);
    expect(geometry.textRight).toBeLessThanOrEqual(geometry.frameRight);
    expect(geometry.textTop).toBeGreaterThanOrEqual(geometry.headerBottom - 1);
    expect(geometry.textBottom).toBeLessThanOrEqual(geometry.frameBottom + 1);
    expect(geometry.unobscured, `${index}: price text not hidden under the rail`).toBe(true);
  }
  await scroller.evaluate((element, scrollTop) => { element.scrollTop = scrollTop; }, initialScrollTop);
}

test('Popular uses Recommended header and tier spacing, without Filtered label padding', async ({ page }) => {
  await page.route('https://api.deadlock-api.com/**', async (route) => {
    const fixture = route.request().url().includes('/assets/heroes') ? 'heroes.json' : 'item-stats-silver.json';
    await route.fulfill({ contentType: 'application/json', body: await readFile(new URL(`./fixtures/deadlock-api/${fixture}`, import.meta.url), 'utf8') });
  });
  await openShop(page);
  await page.getByTestId('tab-popular').click();
  await page.getByTestId('popular-hero-select').selectOption('80');
  await expect(page.getByTestId('item-card-upgrade_close_range')).toBeVisible();
  await expectFirstTierSpacing(page);
  await expectReferenceColumns(page);
  await expectPriceLabelsVisible(page);
});

test('All Items and Selected columns align with the full-width reference header', async ({ page }) => {
  await openShop(page);
  await page.getByTestId('tab-all').click();
  await expect(page.locator('.catalog-list-board .item-card')).toHaveCount(156);
  await page.mouse.move(0, 0);
  await expectReferenceColumns(page);
  await expectPriceLabelsVisible(page);
  await selectAllItems(page);
  await expectReferenceColumns(page);
  await expectPriceLabelsVisible(page);
});

test('Selected renders every item in twelve four-across cells with tallest-cell row heights', async ({ page }) => {
  await openShop(page);
  await selectAllItems(page);
  await expect(page.locator('.catalog-list-board-selected .item-card')).toHaveCount(156);
  await expect(page.locator('.tier-board-row')).toHaveCount(4);
  await expect(page.locator('.tier-board-cell')).toHaveCount(12);
  expect(await renderedIds(page)).toEqual(DEADLOCK_ITEMS.map((item) => item.id).sort());
  await expectFirstTierSpacing(page);

  for (const tier of TIER_BOARD_TIERS) {
    const row = page.locator(`.tier-board-row[data-tier="${tier}"]`);
    await expect(row.locator('.tier-board-price')).toHaveText(String(TIER_COSTS[tier]));
    for (const category of TIER_BOARD_CATEGORIES) {
      await expect(row.locator(`.tier-board-cell[data-category="${category}"] .item-card`)).toHaveCount(COUNTS[category][tier - 1]);
    }
  }

  // Frames are the layout boxes; hover animations intentionally expand cards beyond them.
  const rows = await page.locator('.tier-board-row').evaluateAll((elements) => elements.map((row) => ({
    tier: Number(row.dataset.tier),
    height: row.getBoundingClientRect().height,
    cells: [...row.querySelectorAll('.tier-board-cell')].map((cell) => ({
      category: cell.dataset.category,
      height: cell.getBoundingClientRect().height,
      cardTops: [...cell.querySelectorAll('.item-hover-frame')].map((frame) => Math.round(frame.getBoundingClientRect().top))
    }))
  })));
  for (const row of rows) {
    expect(Math.abs(row.height - Math.max(...row.cells.map((cell) => cell.height))), `tier ${row.tier}: tallest cell sets row height`).toBeLessThanOrEqual(1);
    for (const cell of row.cells) {
      const lines = new Map();
      for (const top of cell.cardTops) lines.set(top, (lines.get(top) || 0) + 1);
      for (const count of lines.values()) expect(count, `${cell.category} tier ${row.tier}: four-across maximum`).toBeLessThanOrEqual(TIER_BOARD_COLUMNS);
      if (row.tier === 3 && cell.category === 'weapon') {
        expect(cell.cardTops).toHaveLength(19);
        expect(lines.size).toBe(5);
      }
    }
  }
});

test('empty tiers keep the stock height and opacity, and empty selection disables bulk selection', async ({ page }) => {
  await openShop(page);
  await page.getByTestId('clear-selection').click();
  await page.getByTestId('tab-weapon').click();
  const item = DEADLOCK_ITEMS.find((candidate) => candidate.category === 'weapon' && candidate.tier === 1);
  await page.getByTestId(`item-card-${item.id}`).click();
  await page.getByTestId('tab-selected').click();
  await expect(page.locator('.catalog-list-board .item-card')).toHaveCount(1);
  await expect(page.locator('.tier-board-row.is-empty-tier')).toHaveCount(3);
  for (const tier of [2, 3, 4]) {
    const row = page.locator(`.tier-board-row[data-tier="${tier}"]`);
    await expect(row).toHaveClass(/is-empty-tier/);
    const metrics = await row.evaluate((element) => ({ height: element.getBoundingClientRect().height, opacity: Number(getComputedStyle(element).opacity) }));
    expect(metrics.height).toBe(SHOP_LAYOUT.emptyTier.height);
    expect(metrics.opacity).toBe(SHOP_LAYOUT.emptyTier.opacity);
  }
  await expect(page.getByRole('button', { name: 'Select all shown' })).toBeEnabled();
  await page.getByTestId('clear-selection').click();
  await expect(page.locator('.tier-board-empty')).toBeVisible();
  await expect(page.locator('.tier-board-empty')).toHaveText('No matching items');
  await expect(page.locator('.catalog-list-board .item-card')).toHaveCount(0);
  await expect(page.locator('.tier-board-row.is-empty-tier')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Select all shown' })).toBeDisabled();
});

test('All Items renders the filtered set and selects exactly those cards', async ({ page }) => {
  await openShop(page);
  await page.getByTestId('clear-selection').click();
  await page.getByTestId('tab-all').click();
  await page.getByTestId('search-input').fill('spirit');
  const supportedIds = new Set(getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).supportedItemIds);
  const expectedIds = DEADLOCK_ITEMS.filter((item) => supportedIds.has(item.id)
    && `${item.id} ${item.label} ${item.description} ${item.category} tier ${item.tier}`.toLowerCase().includes('spirit'))
    .map((item) => item.id).sort();
  await expect(page.locator('.catalog-list-board-all .item-card')).toHaveCount(expectedIds.length);
  expect(await renderedIds(page)).toEqual(expectedIds);
  await expectFirstTierSpacing(page);
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await expect(page.getByTestId('selected-count')).toHaveText(String(expectedIds.length));
  await expect(page.locator('.catalog-list-board-all .item-card[aria-pressed="true"]')).toHaveCount(expectedIds.length);
  await page.getByTestId('tab-selected').click();
  expect(await renderedIds(page)).toEqual(expectedIds);
});

test('the column header remains visible at 6400 and bottom-edge hover stays inside the scroll frame', async ({ page }) => {
  await openShop(page);
  await selectAllItems(page);
  const scroller = page.locator('.tier-board-scroller');
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('.tier-board-row[data-tier="4"] .tier-board-price')).toBeInViewport();
  await expect(page.locator('.tier-board-header')).toBeInViewport();
  const metrics = await scroller.evaluate((element) => {
    const header = element.querySelector('.tier-board-header').getBoundingClientRect();
    const frame = element.getBoundingClientRect();
    return { scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, headerTop: header.top, frameTop: frame.top, headerBottom: header.bottom, frameBottom: frame.bottom };
  });
  expect(metrics.scrollTop).toBeGreaterThan(0);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(Math.abs(metrics.headerTop - metrics.frameTop)).toBeLessThanOrEqual(1);
  expect(metrics.headerBottom).toBeLessThan(metrics.frameBottom);

  const lastItem = DEADLOCK_ITEMS.filter((item) => item.category === 'vitality' && item.tier === 4).at(-1);
  const card = page.getByTestId(`item-card-${lastItem.id}`);
  await card.hover();
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).animationName)).toBe('tooltipCardFloat');
  await expect.poll(() => card.evaluate((element) => Number(getComputedStyle(element.closest('.item-hover-frame').querySelector('.hover-texture-primary')).opacity))).toBeGreaterThan(0.5);
  await expect.poll(() => card.evaluate((element) => {
    const cardRect = element.getBoundingClientRect();
    const frame = element.closest('.tier-board-scroller').getBoundingClientRect();
    return cardRect.left >= frame.left && cardRect.right <= frame.right && cardRect.bottom <= frame.bottom;
  })).toBe(true);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 900, height: 800 }, { width: 390, height: 844 }]) {
  test(`tier cells contain their cards at ${viewport.width}x${viewport.height} with widths of at least 40px`, async ({ page }) => {
    await openShop(page, viewport);
    await selectAllItems(page);
    const cells = await page.locator('.tier-board-cell').evaluateAll((elements) => elements.map((cell) => {
      const bounds = cell.getBoundingClientRect();
      return {
        category: cell.dataset.category,
        tier: cell.closest('.tier-board-row').dataset.tier,
        left: bounds.left,
        right: bounds.right,
        frames: [...cell.querySelectorAll('.item-hover-frame')].map((frame) => {
          const rect = frame.getBoundingClientRect();
          return { left: rect.left, right: rect.right, width: rect.width, top: Math.round(rect.top) };
        })
      };
    }));
    for (const cell of cells) {
      const lines = new Map();
      for (const card of cell.frames) {
        expect(card.left, `${cell.category} T${cell.tier}: left inside cell`).toBeGreaterThanOrEqual(cell.left - 1);
        expect(card.right, `${cell.category} T${cell.tier}: right inside cell`).toBeLessThanOrEqual(cell.right + 1);
        expect(card.width, `${cell.category} T${cell.tier}: minimum tappable width`).toBeGreaterThanOrEqual(40);
        lines.set(card.top, (lines.get(card.top) || 0) + 1);
      }
      for (const count of lines.values()) expect(count).toBeLessThanOrEqual(TIER_BOARD_COLUMNS);
    }
    expect(cells.flatMap((cell) => cell.frames)).toHaveLength(156);
  });
}
