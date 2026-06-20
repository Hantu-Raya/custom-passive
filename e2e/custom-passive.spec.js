import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { zstdDecompressSync } from 'node:zlib';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { PRESET_TEMPLATE_IDS, REQUIRED_GAMEBANANA_TEMPLATE, getPresetTemplate } from '../src/lib/presetTemplates.js';
import { extractArchiveMember } from '../src/lib/archiveExtractor.js';
import { readPassiveFlagTemplate } from '../src/lib/source2PassiveFlags.js';
import { uncompressSource2Resource } from '../src/lib/source2BinaryKv3.js';
import { readVpk } from '../src/lib/vpkReader.js';

const ITEM_IDS = DEADLOCK_ITEMS.map((item) => item.id);
const REQUIRED_TEMPLATE_UPLOAD = `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`;
const TEMPLATE_VERIFICATION_STORAGE_KEY = 'custom-passive:template-verification:v1';
const SELECTED_ITEMS_STORAGE_KEY = 'custom-passive:selected-items:v2';
const TEMPLATE_VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

async function seedTemplateVerification(page, expiresAt) {
  await page.addInitScript(({ key, sha256, expiresAtValue }) => {
    window.localStorage.setItem(key, JSON.stringify({
      sha256,
      expiresAt: expiresAtValue
    }));
  }, {
    key: TEMPLATE_VERIFICATION_STORAGE_KEY,
    sha256: REQUIRED_GAMEBANANA_TEMPLATE.sha256,
    expiresAtValue: expiresAt
  });
}

async function linkTemplate(page, presetId = PRESET_TEMPLATE_IDS.PASSIVE_ONLY) {
  const preset = getPresetTemplate(presetId);
  await expect(page.getByTestId('template-gate')).toBeVisible();
  await expect(page.getByTestId('template-gate')).toContainText(REQUIRED_GAMEBANANA_TEMPLATE.fileName);
  await page.getByTestId('template-gate-preset').selectOption(presetId);
  await page.getByTestId('template-gate-file').setInputFiles(REQUIRED_TEMPLATE_UPLOAD);
  await expect(page.getByRole('status')).toContainText(`Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${preset.label}`, { timeout: 15000 });
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
}

async function readDownloadedVpk(filePath, memberName) {
  expect(filePath).toBeTruthy();
  const archiveBytes = new Uint8Array(await readFile(filePath));
  const vpkBytes = await extractArchiveMember(archiveBytes, 'download.7z', memberName);
  const files = readVpk(vpkBytes);
  expect(files.map((file) => file.path)).toEqual(['scripts/abilities.vdata_c']);
  const parsedTemplate = readPassiveFlagTemplate(uncompressSource2Resource(files[0].bytes, { decompressZstd: zstdDecompressSync }), ITEM_IDS);
  return { files, selectedItemIds: parsedTemplate.selectedItemIds, vdataSize: files[0].bytes.byteLength, archiveSize: archiveBytes.byteLength };
}

async function searchForToxic(page) {
  await expect(page.getByTestId('search-input')).toBeVisible();
  await page.getByTestId('search-input').fill('Toxic');
  await expect(page.getByTestId('item-card-upgrade_toxic_bullets')).toBeVisible();
}

async function waitForHydration(page, presetId = PRESET_TEMPLATE_IDS.PASSIVE_ONLY) {
  await page.waitForLoadState('networkidle');
  await linkTemplate(page, presetId);
}
async function openVitalityShop(page, viewport, presetId = PRESET_TEMPLATE_IDS.PASSIVE_ONLY) {
  await page.setViewportSize(viewport);
  await page.goto('/custom-passive/');
  await waitForHydration(page, presetId);
  await page.getByTestId('tab-vitality').click();
  await expect(page.getByTestId('tab-vitality')).toHaveAttribute('aria-pressed', 'true');
}

async function openWeaponShop(page, presetId = PRESET_TEMPLATE_IDS.PASSIVE_ONLY) {
  await page.goto('/custom-passive/');
  await waitForHydration(page, presetId);
  await page.getByTestId('tab-weapon').click();
  await expect(page.getByTestId('tab-weapon')).toHaveAttribute('aria-pressed', 'true');
}

async function findWeaponApproachTarget(page, mode) {
  return page.evaluate((approachMode) => {
    for (const card of document.querySelectorAll('.item-card')) {
      const box = card.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const nearY = box.top - (approachMode === 'far-above' ? 80 : 18);
      if (nearY <= 1) continue;
      if (document.elementFromPoint(x, nearY)?.closest('.item-card')) continue;
      return {
        testId: card.getAttribute('data-testid'),
        x,
        startY: Math.max(1, nearY - 90),
        nearY
      };
    }
    return null;
  }, mode);
}

async function moveToApproachTarget(page, target) {
  expect(target).toBeTruthy();
  await page.mouse.move(target.x, target.startY, { steps: 2 });
  await page.mouse.move(target.x, target.nearY, { steps: 4 });
}

async function readShopGeometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('.build-panel').getBoundingClientRect();
    const tabs = document.querySelector('.shop-tabs').getBoundingClientRect();
    const board = document.querySelector('.catalog-board').getBoundingClientRect();
    return {
      panelWidth: panel.width,
      panelRight: panel.right,
      tabsLeft: tabs.left,
      tabsWidth: tabs.width,
      boardWidth: board.width,
      boardRight: board.right,
      viewportWidth: window.innerWidth
    };
  });
}

async function readCardBadgeMetrics(card) {
  return card.evaluate((cardElement) => {
    const cardBox = cardElement.getBoundingClientRect();
    const iconBox = cardElement.querySelector('.item-icon').getBoundingClientRect();
    const nameBox = cardElement.querySelector('.item-name').getBoundingClientRect();
    const badges = [...cardElement.querySelectorAll('.item-activation-badge')].map((badge) => {
      const box = badge.getBoundingClientRect();
      const style = getComputedStyle(badge);
      return {
        text: badge.textContent,
        top: box.top,
        bottom: box.bottom,
        widthRatio: box.width / cardBox.width,
        heightRatio: box.height / cardBox.width,
        borderRadius: style.borderRadius,
        transform: style.transform,
        background: style.backgroundColor
      };
    });
    return {
      iconBottom: iconBox.bottom,
      nameTop: nameBox.top,
      badges
    };
  });
}

async function readCardTextMetrics(card) {
  return card.evaluate((cardElement) => {
    const cardBox = cardElement.getBoundingClientRect();
    const nameBox = cardElement.querySelector('.item-name').getBoundingClientRect();
    const nameStyle = getComputedStyle(cardElement.querySelector('.item-name'));
    return {
      cardRight: cardBox.right,
      cardBottom: cardBox.bottom,
      cardWidth: cardBox.width,
      nameRight: nameBox.right,
      nameBottom: nameBox.bottom,
      nameSize: parseFloat(nameStyle.fontSize),
    };
  });
}

test('downloads a compressed archive with browser-selected passive flag bytes', async ({ page }) => {
  await page.goto('/custom-passive/');
  await waitForHydration(page);
  await expect(page.getByTestId('selected-count')).toHaveText(String(getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).presetItemIds.length));
  await page.getByTestId('clear-selection').click();
  await expect(page.getByTestId('selected-count')).toHaveText('0');
  await page.getByTestId('tab-search').click();
  await page.getByTestId('search-input').fill('Headshot');
  await page.getByTestId('item-card-upgrade_headshot_booster').click();
  await expect(page.getByTestId('item-card-upgrade_headshot_booster')).toHaveAttribute('aria-pressed', 'true');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('build-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).archiveOutputFileName);

  const { selectedItemIds, archiveSize } = await readDownloadedVpk(await download.path(), 'pak04_dir.vpk');
  expect(archiveSize).toBeLessThan(450_000);
  expect(selectedItemIds).toEqual(['upgrade_headshot_booster']);
  await expect(page.getByRole('status')).toContainText(`Built ${getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY).archiveOutputFileName}`);
});

test('loads verified GameBanana presets before building', async ({ page }) => {
  await page.goto('/custom-passive/');
  await waitForHydration(page);
  const passiveOnly = getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_ONLY);
  const passiveAndActive = getPresetTemplate(PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE);
  await expect(page.getByTestId('gamebanana-template-link')).toHaveAttribute('href', REQUIRED_GAMEBANANA_TEMPLATE.modUrl);
  await expect(page.getByTestId('preset-template-archive-sha')).toHaveText(REQUIRED_GAMEBANANA_TEMPLATE.sha256);
  await expect(page.getByTestId('preset-template-sha')).toHaveText(passiveOnly.templateSha256);
  await expect(page.getByTestId('output-filename')).toHaveText(passiveOnly.archiveOutputFileName);
  await expect(page.getByTestId('preset-template-count')).toHaveText(String(passiveOnly.presetItemIds.length));
  await expect(page.getByTestId('change-template')).toHaveCount(0);
  await expect(page.getByTestId('selected-count')).toHaveText(String(passiveOnly.presetItemIds.length));

  await page.getByTestId('preset-template-select').selectOption(PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE);
  await expect(page.getByRole('status')).toContainText(`Verified ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}; ${passiveAndActive.label}`, { timeout: 15000 });
  await expect(page.getByTestId('output-filename')).toHaveText(passiveAndActive.archiveOutputFileName);
  await expect(page.getByTestId('preset-template-count')).toHaveText(String(passiveAndActive.presetItemIds.length));
  await expect(page.getByTestId('selected-count')).toHaveText(String(passiveAndActive.presetItemIds.length));

  await page.getByTestId('clear-selection').click();
  await page.getByTestId('tab-search').click();
  await page.getByTestId('search-input').fill('Close Range');
  await page.getByTestId('item-card-upgrade_close_range').click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('build-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(passiveAndActive.archiveOutputFileName);
  const { selectedItemIds, archiveSize } = await readDownloadedVpk(await download.path(), passiveAndActive.outputFileName);
  expect(archiveSize).toBeLessThan(450_000);
  expect(selectedItemIds).toEqual(['upgrade_close_range']);
  await expect(page.getByRole('status')).toContainText(`Built ${passiveAndActive.archiveOutputFileName}`);
});

test('reuses template verification for 12 hours then asks again', async ({ page }) => {
  await seedTemplateVerification(page, Date.now() + TEMPLATE_VERIFICATION_TTL_MS);
  await page.goto('/custom-passive/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('template-gate')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(`Verified saved ${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`, { timeout: 15000 });
  await expect(page.getByTestId('build-download')).toBeEnabled();

  const expiredPage = await page.context().newPage();
  await seedTemplateVerification(expiredPage, Date.now() - 1);
  await expiredPage.goto('/custom-passive/');
  await expect(expiredPage.getByTestId('template-gate')).toBeVisible();
  await expect(expiredPage.getByTestId('build-download')).toBeDisabled();
});

test('does not predict hover while template is required', async ({ page }) => {
  await page.addInitScript(({ key }) => {
    window.localStorage.setItem(key, JSON.stringify(['upgrade_split_shot']));
  }, { key: SELECTED_ITEMS_STORAGE_KEY });
  await page.goto('/custom-passive/');
  await expect(page.getByTestId('template-gate')).toBeVisible();

  const cardBox = await page.getByTestId('item-card-upgrade_split_shot').boundingBox();
  expect(cardBox).toBeTruthy();
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, { steps: 4 });

  await expect(page.locator('.item-card.is-predicted-hover')).toHaveCount(0);
  await expect(page.locator('.shop-shell.is-item-hovered')).toHaveCount(0);
});

test('plays the Source 2 item hover animation', async ({ page }) => {
  await openWeaponShop(page, PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE);

  const target = await page.getByTestId('item-card-upgrade_split_shot').evaluate((card) => {
    const box = card.getBoundingClientRect();
    const nearX = box.left - 2;
    const y = box.top + box.height / 2;
    return {
      testId: card.getAttribute('data-testid'),
      startX: Math.max(1, nearX - 90),
      nearX,
      centerX: box.left + box.width / 2,
      y
    };
  });

  await page.mouse.move(target.centerX, target.y);
  await expect.poll(async () => page.locator(`[data-testid="${target.testId}"]`).evaluate((card) => {
    const frame = card.closest('.item-hover-frame');
    const texture = frame.querySelector('.hover-texture-primary');
    return Number(getComputedStyle(texture).opacity);
  })).toBeGreaterThan(0.7);
  const hoverStyle = await page.locator(`[data-testid="${target.testId}"]`).evaluate((card) => {
    const frame = card.closest('.item-hover-frame');
    const texture = frame.querySelector('.hover-texture-primary');
    const cardBox = card.getBoundingClientRect();
    const textureBox = texture.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    const textureStyle = getComputedStyle(texture);
    return {
      cardAnimation: cardStyle.animationName,
      cardAnimationDuration: cardStyle.animationDuration,
      cardAnimationTiming: cardStyle.animationTimingFunction,
      cardTransform: cardStyle.transform,
      textureAnimation: textureStyle.animationName,
      textureAnimationDuration: textureStyle.animationDuration,
      textureAnimationTiming: textureStyle.animationTimingFunction,
      textureImage: textureStyle.backgroundImage,
      textureWidthRatio: textureBox.width / cardBox.width
    };
  });
  expect(hoverStyle.cardAnimation).toBe('tooltipCardFloat');
  expect(hoverStyle.cardTransform).not.toBe('none');
  expect(hoverStyle.textureAnimation).toBe('tooltipSlashDrift');
  expect(hoverStyle.cardAnimationDuration).toBe('5s');
  expect(hoverStyle.textureAnimationDuration).toBe('5s');
  expect(hoverStyle.cardAnimationTiming).toBe('linear');
  expect(hoverStyle.textureAnimationTiming).toBe('linear');
  expect(hoverStyle.textureImage).toContain('catalog_tooltip_header_weapon_psd');
  expect(hoverStyle.textureWidthRatio).toBeGreaterThan(2);
});

test('darkens shop while linked upgrade cards pop without splash', async ({ page }) => {
  await openWeaponShop(page);
  const selectedCard = page.getByTestId('item-card-upgrade_close_range');
  if (await selectedCard.getAttribute('aria-pressed') !== 'true') {
    await selectedCard.click();
  }
  await page.getByTestId('item-card-upgrade_headshot_booster').hover();

  await expect(page.locator('.shop-shell')).toHaveClass(/is-item-hovered/);
  await expect(page.locator('.item-card.is-hover-related')).toHaveCount(1);

  await expect.poll(async () => page.evaluate(() => {
    const board = document.querySelector('.catalog-list-board, .catalog-board');
    return Number(getComputedStyle(board, '::after').opacity);
  })).toBeGreaterThan(0.8);
  const metrics = await page.evaluate(() => {
    const hovered = document.querySelector('[data-testid="item-card-upgrade_headshot_booster"]');
    const related = document.querySelector('.item-card.is-hover-related');
    const relatedIds = Array.from(document.querySelectorAll('.item-card.is-hover-related'), (card) => card.dataset.itemId);
    const selected = document.querySelector('[data-testid="item-card-upgrade_close_range"]');
    const dimmed = Array.from(document.querySelectorAll('.item-card')).find((card) => card !== hovered && card !== related && card !== selected);
    const relatedTexture = related.closest('.item-hover-frame').querySelector('.hover-texture-primary');
    const board = document.querySelector('.catalog-list-board, .catalog-board');
    const boardDimOpacity = getComputedStyle(board, '::after').opacity;
    return {
      boardOverflow: getComputedStyle(document.querySelector('.catalog-content')).overflow,
      boardPaddingLeft: parseFloat(getComputedStyle(board).paddingLeft),
      hoveredFilter: getComputedStyle(hovered).filter,
      relatedId: related.dataset.itemId,
      relatedIds,
      weakeningHeadshotRelated: Boolean(document.querySelector('[data-testid="item-card-upgrade_headshot_booster2"]')?.classList.contains('is-hover-related')),
      relatedFilter: getComputedStyle(related).filter,
      relatedTransform: getComputedStyle(related).transform,
      relatedTextureOpacity: Number(getComputedStyle(relatedTexture).opacity),
      dimmedFilter: getComputedStyle(dimmed).filter,
      selectedFilter: getComputedStyle(selected).filter,
      boardDimOpacity
    };
  });

  expect(metrics.boardOverflow).toBe('visible');
  expect(metrics.hoveredFilter).toBe('none');
  expect(metrics.relatedId).toBe('upgrade_headhunter');
  expect(metrics.relatedFilter).toBe('none');
  expect(metrics.relatedIds).toEqual(['upgrade_headhunter']);
  expect(metrics.weakeningHeadshotRelated).toBe(false);
  expect(metrics.relatedTransform).not.toBe('none');
  expect(metrics.relatedTextureOpacity).toBe(0);
  expect(metrics.dimmedFilter).toContain('brightness');
  expect(metrics.selectedFilter).toContain('brightness');
  expect(Number(metrics.boardDimOpacity)).toBeGreaterThan(0.8);
});

test('does not predict hover for fast movement above item cards', async ({ page }) => {
  await openWeaponShop(page);

  const target = await findWeaponApproachTarget(page, 'far-above');
  await moveToApproachTarget(page, target);

  await expect(page.locator('.item-card.is-predicted-hover')).toHaveCount(0);
});

test('predicts vertical hover only near an item card', async ({ page }) => {
  await openWeaponShop(page);

  const target = await findWeaponApproachTarget(page, 'near-above');
  await moveToApproachTarget(page, target);

  await expect(page.locator(`[data-testid="${target.testId}"]`)).toHaveClass(/is-predicted-hover/);
  await expect(page.locator('.shop-shell')).not.toHaveClass(/is-item-hovered/);
});


test('embeds search only inside the search shop tab', async ({ page }) => {
  await page.goto('/custom-passive/');
  await waitForHydration(page);
  await page.getByTestId('tab-weapon').click();
  await expect(page.locator('.catalog-title-row')).toHaveCount(0);
  await expect(page.getByTestId('search-input')).toHaveCount(0);

  await page.getByTestId('tab-search').click();
  await searchForToxic(page);

  await page.getByTestId('tab-weapon').click();
  await expect(page.getByTestId('search-input')).toHaveCount(0);
  await expect(page.getByTestId('item-card-upgrade_toxic_bullets')).toBeVisible();
});

test('shows selected search and all tabs as tiered item lists', async ({ page }) => {
  await page.goto('/custom-passive/');
  await waitForHydration(page, PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE);
  await page.getByTestId('tab-search').click();
  await page.getByTestId('search-input').fill('Close Range');
  await page.getByTestId('item-card-upgrade_close_range').click();

  await page.getByTestId('tab-selected').click();
  await expect(page.locator('.catalog-list-board')).toHaveCount(1);
  await expect(page.locator('.list-tier-section')).not.toHaveCount(0);
  for (const tab of ['all', 'search']) {
    await page.getByTestId(`tab-${tab}`).click();
    await expect(page.locator('.catalog-list-board')).toHaveCount(1);
    await expect(page.getByTestId('item-card-upgrade_close_range')).toBeVisible();
    await expect(page.getByTestId('item-card-upgrade_health')).toBeVisible();
    await expect(page.getByTestId('item-card-upgrade_extra_charge')).toBeVisible();
  }

  await searchForToxic(page);
  await expect(page.getByTestId('item-card-upgrade_close_range')).not.toBeVisible();
});

test('places the shop catalog close to the builder panel on desktop', async ({ page }) => {
  await openVitalityShop(page, { width: 1569, height: 912 });

  const geometry = await readShopGeometry(page);

  expect(geometry.tabsLeft).toBeGreaterThan(geometry.panelRight);
  expect(geometry.tabsLeft - geometry.panelRight).toBeGreaterThan(40);
  expect(geometry.tabsLeft - geometry.panelRight).toBeLessThan(58);
});

test('keeps the game shop board usable on compact desktop viewports', async ({ page }) => {
  await openVitalityShop(page, { width: 1000, height: 900 });

  const geometry = await readShopGeometry(page);

  expect(geometry.panelWidth).toBeGreaterThanOrEqual(240);
  expect(geometry.tabsWidth).toBeLessThanOrEqual(56);
  expect(geometry.boardWidth).toBeGreaterThanOrEqual(620);
  expect(geometry.tabsLeft - geometry.panelRight).toBeGreaterThanOrEqual(28);
  expect(geometry.tabsLeft - geometry.panelRight).toBeLessThanOrEqual(32);
});

test('renders active and imbue badges as in-game card strips', async ({ page }) => {
  await page.goto('/custom-passive/');
  await waitForHydration(page, PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE);
  await page.getByTestId('tab-spirit').click();

  const imbueCardMetrics = await readCardBadgeMetrics(page.getByTestId('item-card-upgrade_quick_silver'));
  const imbueMetrics = imbueCardMetrics.badges.find((badge) => badge.text === 'IMBUE');

  const activeCardMetrics = await readCardBadgeMetrics(page.getByTestId('item-card-upgrade_cold_front'));
  const activeMetrics = activeCardMetrics.badges.find((badge) => badge.text === 'ACTIVE');

  const echoMetrics = await readCardBadgeMetrics(page.getByTestId('item-card-upgrade_ability_power_shard'));

  expect(imbueMetrics.text).toBe('IMBUE');
  expect(imbueMetrics.widthRatio).toBeGreaterThan(0.88);
  expect(imbueMetrics.widthRatio).toBeLessThan(0.94);
  expect(imbueMetrics.heightRatio).toBeGreaterThan(0.1);
  expect(imbueMetrics.heightRatio).toBeLessThan(0.13);
  expect(Math.abs(imbueMetrics.bottom - imbueCardMetrics.iconBottom)).toBeLessThan(1);
  expect(imbueMetrics.bottom).toBeLessThanOrEqual(imbueCardMetrics.nameTop + 0.5);
  expect(imbueMetrics.borderRadius).toBe('0px');
  expect(imbueMetrics.transform).toBe('none');
  expect(imbueMetrics.background).toBe('rgb(111, 56, 147)');
  expect(activeMetrics.text).toBe('ACTIVE');
  expect(activeMetrics.background).toBe('rgb(24, 23, 24)');
  expect(echoMetrics.badges.map((badge) => badge.text)).toEqual(['IMBUE', 'ACTIVE']);
  expect(echoMetrics.badges[0].widthRatio).toBeGreaterThan(0.86);
  expect(echoMetrics.badges[1].widthRatio).toBeLessThan(0.7);
  expect(Math.abs(echoMetrics.badges[1].top - echoMetrics.badges[0].bottom)).toBeLessThan(0.5);
  expect(Math.abs(echoMetrics.badges.at(-1).bottom - echoMetrics.iconBottom)).toBeLessThan(1);
  expect(echoMetrics.badges.at(-1).bottom).toBeLessThanOrEqual(echoMetrics.nameTop + 0.5);
  expect(echoMetrics.badges[0].top).toBeGreaterThan(echoMetrics.iconBottom - 16);
});

test('renders item icons and text at Source 2 shop-card proportions', async ({ page }) => {
  await page.goto('/custom-passive/');
  await waitForHydration(page, PRESET_TEMPLATE_IDS.PASSIVE_AND_ACTIVE);
  await page.getByTestId('tab-weapon').click();

  const card = page.getByTestId('item-card-upgrade_close_range');
  const icon = card.locator('.item-icon');
  const image = icon.locator('img');
  const name = card.locator('.item-name');
  await expect(image).toHaveAttribute('src', /assets\/deadlock\/panorama\/images\/items\/weapon\/close_quarters_psd\.webp$/);

  const metrics = await card.evaluate((cardElement) => {
    const cardBox = cardElement.getBoundingClientRect();
    const iconBox = cardElement.querySelector('.item-icon').getBoundingClientRect();
    const imageBox = cardElement.querySelector('.item-icon img').getBoundingClientRect();
    const nameStyle = getComputedStyle(cardElement.querySelector('.item-name'));
    return {
      cardWidth: cardBox.width,
      iconHeight: iconBox.height,
      imageWidth: imageBox.width,
      imageHeight: imageBox.height,
      nameSize: parseFloat(nameStyle.fontSize),
      nameWeight: nameStyle.fontWeight,
      nameFamily: nameStyle.fontFamily,
    };
  });

  const activeMetrics = await page.getByTestId('item-card-upgrade_fleetfoot_boots').evaluate((cardElement) => {
    const cardBox = cardElement.getBoundingClientRect();
    const badgeStyle = getComputedStyle(cardElement.querySelector('.item-activation-badge'));
    return {
      cardWidth: cardBox.width,
      badgeSize: parseFloat(badgeStyle.fontSize),
    };
  });

  const longNameMetrics = await readCardTextMetrics(page.getByTestId('item-card-upgrade_high_velocity_mag'));

  await page.getByTestId('tab-vitality').click();
  const longWordMetrics = await readCardTextMetrics(page.getByTestId('item-card-upgrade_juggernaut'));

  expect(metrics.nameFamily).toMatch(/Arial/);
  expect(Math.abs(metrics.iconHeight - metrics.cardWidth)).toBeLessThan(1);
  expect(Math.abs(metrics.imageWidth - metrics.cardWidth * 0.95)).toBeLessThan(1);
  expect(Math.abs(metrics.imageHeight - metrics.cardWidth * 0.95)).toBeLessThan(1);
  expect(Math.abs(metrics.nameSize - metrics.cardWidth * 0.1875)).toBeLessThan(0.6);
  expect(metrics.nameWeight).toBe('700');
  expect(Math.abs(activeMetrics.badgeSize - activeMetrics.cardWidth * 0.10625)).toBeLessThan(0.6);
  expect(longNameMetrics.nameSize).toBeLessThan(metrics.nameSize);
  expect(longWordMetrics.nameSize).toBeLessThan(metrics.nameSize);
  expect(longWordMetrics.nameRight).toBeLessThanOrEqual(longWordMetrics.cardRight + 0.5);
  expect(longWordMetrics.nameBottom).toBeLessThanOrEqual(longWordMetrics.cardBottom + 0.5);
  expect(longNameMetrics.nameBottom).toBeLessThanOrEqual(longNameMetrics.cardBottom + 0.5);
});


test('does not expose debug guide controls or overlays', async ({ page }) => {
  await page.goto('/custom-passive/?debugGuides');
  await waitForHydration(page);
  await page.getByTestId('tab-weapon').click();

  await expect(page.getByTestId('toggle-debug-guides')).toHaveCount(0);
  await expect(page.getByTestId('debug-guides')).toHaveCount(0);
  await expect(page.locator('[data-testid^="debug-tier-"]')).toHaveCount(0);
  await expect(page.getByTestId('item-card-upgrade_close_range')).toBeVisible();
});
