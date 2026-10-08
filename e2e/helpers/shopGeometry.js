import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

export async function rectOf(page, selector) {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, w: width, h: height };
  });
}

export function scaleReferenceRect(refRect, refBoard, renderedBoard) {
  const scaleX = renderedBoard.w / refBoard.w;
  const scaleY = renderedBoard.h / refBoard.h;
  return {
    x: renderedBoard.x + (refRect.x - refBoard.x) * scaleX,
    y: renderedBoard.y + (refRect.y - refBoard.y) * scaleY,
    w: refRect.w * scaleX,
    h: refRect.h * scaleY
  };
}

export function expectRectNear(actual, expected, tolerancePx, label) {
  for (const dimension of ['x', 'y', 'w', 'h']) {
    expect(Math.abs(actual[dimension] - expected[dimension]), `${label}: ${dimension} (actual ${actual[dimension]}, expected ${expected[dimension]})`).toBeLessThanOrEqual(tolerancePx);
  }
}

export function loadReferenceAnchors() {
  return JSON.parse(readFileSync(new URL('../fixtures/shop-reference-anchors.json', import.meta.url), 'utf8'));
}
