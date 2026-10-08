import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';

const FIXTURES = new URL('../e2e/fixtures/', import.meta.url);
const anchors = JSON.parse(readFileSync(new URL('shop-reference-anchors.json', FIXTURES), 'utf8'));
const CAPTURE_NAMES = [
  'tab_weapon', 'tab_spirit', 'tab_vitality', 'tab_popular', 'tab_builds',
  'all_items_00', 'all_items_01', 'all_items_02', 'all_items_03',
  'popular_silver_00', 'popular_abrams_00', 'menu_Physical', 'menu_Spirit',
  'menu_Defense', 'menu_Mobility', 'menu_Disruption', 'menu_Misc',
  'flt_Physical_Ammo_00'
];
const catalogById = new Map(DEADLOCK_ITEMS.map((item) => [item.id, item]));

function assertRect(rect, label) {
  assert.ok(rect, `${label}: missing rectangle`);
  for (const dimension of ['x', 'y', 'w', 'h']) {
    assert.ok(Number.isInteger(rect[dimension]), `${label}: ${dimension} must be an integer`);
  }
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0, `${label}: invalid rectangle`);
  assert.ok(rect.x + rect.w <= anchors.frame.w, `${label}: outside frame horizontally`);
  assert.ok(rect.y + rect.h <= anchors.frame.h, `${label}: outside frame vertically`);
}

test('reference anchors cover exactly the 18 copied client-6763 captures', () => {
  assert.equal(anchors.clientVersion, 6763);
  assert.deepEqual(anchors.frame, { w: 1600, h: 900 });
  assert.equal(Object.keys(anchors.captures).length, 18);
  assert.deepEqual(Object.keys(anchors.captures).sort(), [...CAPTURE_NAMES].sort());
  for (const name of CAPTURE_NAMES) {
    const capture = anchors.captures[name];
    const bytes = readFileSync(new URL(`shop-reference/${name}.png`, FIXTURES));
    assert.equal(capture.sha256, createHash('sha256').update(bytes).digest('hex'), `${name}: copied capture SHA-256`);
    assert.equal(capture.size, bytes.byteLength, `${name}: copied capture size`);
    assertRect(capture.board, `${name}: board`);
    assert.equal(capture.tabs.length, 6, `${name}: six nav tabs`);
    capture.tabs.forEach((tab, index) => {
      assertRect(tab, `${name}: tab ${index + 1}`);
      if (index > 0) {
        assert.ok(tab.y > capture.tabs[index - 1].y, `${name}: tabs ordered top to bottom`);
      }
    });
    assert.ok(Array.isArray(capture.cards), `${name}: card hit list`);
    for (const card of capture.cards) {
      assert.ok(catalogById.has(card.id), `${name}: unknown card ${card.id}`);
      assertRect(card, `${name}: ${card.id}`);
      assert.equal(card.w, 60, `${name}: ${card.id} icon width`);
      assert.equal(card.h, 60, `${name}: ${card.id} icon height`);
      const minimumScore = card.fallback === true ? 0.75 : 0.88;
      assert.ok(card.score >= minimumScore && card.score <= 1, `${name}: ${card.id} match score`);
    }
    if (name.startsWith('menu_')) {
      assertRect(capture.menu, `${name}: menu`);
      assert.equal(capture.cards.length, 0, `${name}: menu captures exclude card matching`);
    }
  }
});

for (const category of ['weapon', 'spirit', 'vitality']) {
  test(`${category} reference contains every category card and four measured tiers`, () => {
    const capture = anchors.captures[`tab_${category}`];
    const expectedIds = DEADLOCK_ITEMS.filter((item) => item.category === category).map((item) => item.id).sort();
    assert.deepEqual(capture.cards.map((card) => card.id).sort(), expectedIds);
    assert.deepEqual(Object.keys(capture.tiers).sort(), ['1', '2', '3', '4']);
    for (const tier of [1, 2, 3, 4]) {
      const measured = capture.tiers[tier];
      const label = `${category}: tier ${tier}`;
      assertRect(measured.rect, `${label} union`);
      assertRect(measured.firstCard, `${label} first card`);
      const hits = capture.cards.filter((card) => catalogById.get(card.id).tier === tier);
      const x = Math.min(...hits.map((card) => card.x));
      const y = Math.min(...hits.map((card) => card.y));
      assert.deepEqual(measured.rect, {
        x, y,
        w: Math.max(...hits.map((card) => card.x + card.w)) - x,
        h: Math.max(...hits.map((card) => card.y + card.h)) - y
      }, `${label}: union covers all tier icons`);
      const first = [...hits].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))[0];
      assert.deepEqual(measured.firstCard, first, `${label}: top-left card`);
    }
  });
}

test('four All Items snaps together cover all 156 catalog ids', () => {
  assert.equal(DEADLOCK_ITEMS.length, 156);
  const ids = new Set(['00', '01', '02', '03'].flatMap((snap) => anchors.captures[`all_items_${snap}`].cards.map((card) => card.id)));
  assert.deepEqual([...ids].sort(), DEADLOCK_ITEMS.map((item) => item.id).sort());
});

for (const hero of ['silver', 'abrams']) {
  test(`${hero} Popular reference contains visible cards`, () => {
    assert.ok(anchors.captures[`popular_${hero}_00`].cards.length >= 1);
  });
}
