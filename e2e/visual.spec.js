import { expect, test } from '@playwright/test';
import { PRESET_TEMPLATE_IDS, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../src/lib/presetTemplates.js';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.deadlock-api.com/**', (route) => route.abort());
});

const REQUIRED_TEMPLATE_UPLOAD = process.env.CUSTOM_PASSIVE_TEMPLATE_ARCHIVE
  || `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`;

async function linkTemplate(page, presetId = PRESET_TEMPLATE_IDS.PASSIVE_ONLY) {
  const preset = getPresetTemplate(presetId);
  await expect(page.getByTestId('template-gate')).toBeVisible();
  await expect(page.getByTestId('template-gate')).toContainText(REQUIRED_GAMEBANANA_TEMPLATE.fileName);
  await page.getByTestId('template-gate-preset').selectOption(presetId);
  await page.getByTestId('template-gate-file').setInputFiles(REQUIRED_TEMPLATE_UPLOAD);
  await expect(page.getByRole('status')).toContainText(`Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${preset.label}`, { timeout: 15000 });
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
}

async function openShop(page) {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  await linkTemplate(page);
}

async function openWeaponShop(page) {
  await openShop(page);
  await page.getByTestId('tab-weapon').click();
  await expect(page.getByTestId('tab-weapon')).toHaveAttribute('aria-pressed', 'true');
  await parkMouse(page);
}

async function parkMouse(page) {
  await page.mouse.move(1, 1);
  await expect(page.locator('.shop-shell.is-item-hovered')).toHaveCount(0);
  await expect(page.locator('.item-card.is-predicted-hover')).toHaveCount(0);
}

async function pauseSupporterMarquee(page) {
  await page.addStyleTag({ content: '.catalog-supporter-track { animation-play-state: paused !important; animation: none !important; }' });
}

test('template gate dialog stays unchanged', async ({ page }) => {
  await page.goto('./');
  await page.waitForLoadState('networkidle');
  const dialog = page.locator('[data-testid="template-gate"] section');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveScreenshot('template-gate.png');
});

test('build panel stays unchanged', async ({ page }) => {
  await openShop(page);
  await parkMouse(page);
  await expect(page.locator('.build-panel')).toHaveScreenshot('build-panel.png');
});

test('supporter footer stays unchanged', async ({ page }) => {
  await openShop(page);
  await parkMouse(page);
  await pauseSupporterMarquee(page);
  await expect(page.locator('.catalog-support-footer')).toHaveScreenshot('support-footer.png');
});

test('unselected and selected cards stay unchanged', async ({ page }) => {
  await openWeaponShop(page);
  const card = page.getByTestId('item-card-upgrade_close_range');
  if (await card.getAttribute('aria-pressed') === 'true') {
    await card.click();
  }
  await parkMouse(page);
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await expect(card).toHaveClass(/is-off/);
  await expect(card).toHaveScreenshot('card-unselected.png');

  await card.click();
  await parkMouse(page);
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toHaveClass(/is-selected/);
  await expect(card).toHaveScreenshot('card-selected.png');
});

test('hovered card and related upgrade stay unchanged', async ({ page }) => {
  await openWeaponShop(page);
  const hoveredCard = page.getByTestId('item-card-upgrade_headshot_booster');
  const relatedCard = page.getByTestId('item-card-upgrade_headhunter');
  await expect(hoveredCard).toBeVisible();
  const box = await hoveredCard.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.shop-shell.is-item-hovered')).toHaveCount(1);
  await expect(relatedCard).toHaveClass(/is-hover-related/);
  await expect(hoveredCard).toHaveScreenshot('card-hovered.png');
  await expect(relatedCard).toHaveScreenshot('card-related-hover.png');
});

test('compact viewport keeps the footer in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openWeaponShop(page);
  await pauseSupporterMarquee(page);
  const footer = page.locator('.catalog-support-footer');
  await expect(footer).toBeVisible();
  await expect.poll(() => footer.evaluate((element) => element.getBoundingClientRect().bottom - window.innerHeight)).toBeLessThanOrEqual(0);
  await expect(page.locator('body')).toHaveScreenshot('compact.png');
});
