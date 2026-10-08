import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function findRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[\\s\\S]*?)\\}`));
  assert.ok(match?.groups?.body, `Missing CSS rule for ${selector}`);
  return match.groups.body;
}

test('All Items search header stays above the scrolling list and spans the board width', async () => {
  const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  const component = await readFile(new URL('../src/components/CustomPassiveShop.jsx', import.meta.url), 'utf8');
  const listBoardRule = findRule(css, '.catalog-list-board');
  const searchBoxRule = findRule(css, '.catalog-list-board > .search-box');
  const scrollerRule = findRule(css, '.tier-board-scroller');

  assert.match(listBoardRule, /display:\s*flex\s*;/);
  assert.match(listBoardRule, /flex-direction:\s*column\s*;/);
  assert.match(listBoardRule, /padding:\s*0\s*;/);
  assert.doesNotMatch(listBoardRule, /overflow(?:-y)?:\s*(?:auto|scroll)\s*;/);
  assert.match(searchBoxRule, /position:\s*relative\s*;/);
  assert.match(searchBoxRule, /flex:\s*0\s+0\s+auto\s*;/);
  assert.match(searchBoxRule, /margin:\s*0\s*;/);
  assert.match(searchBoxRule, /background:\s*rgb\(/);
  assert.match(scrollerRule, /overflow-y:\s*auto\s*;/);
  assert.match(scrollerRule, /min-height:\s*0\s*;/);
  assert.match(component, /\{activeTab === 'all' && <SearchBox\b[^\n]*\/>\}/);
  assert.doesNotMatch(component, /tab-search|activeTab === 'search'/);
  assert.match(findRule(css, '.catalog-list-board > .search-box .search-row'), /position:\s*relative\s*;/);
  assert.match(component, /\{query && <button\b[^>\n]*data-testid="clear-search"/);
  assert.match(css, /::-webkit-search-cancel-button[\s\S]*?appearance:\s*none\s*;/);
});
