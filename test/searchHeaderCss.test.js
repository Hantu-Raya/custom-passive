import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function findRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[\\s\\S]*?)\\}`));
  assert.ok(match?.groups?.body, `Missing CSS rule for ${selector}`);
  return match.groups.body;
}

test('search list topbar scrolls with the search header instead of the list viewport', async () => {
  const css = await readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8');
  const listBoardRule = findRule(css, '.catalog-list-board');
  const searchBoxRule = findRule(css, '.catalog-list-board > .search-box');

  assert.doesNotMatch(listBoardRule, /#2a2a24\s+0\s+76px/);
  assert.match(searchBoxRule, /background:/);
  assert.match(searchBoxRule, /margin:\s*0\s+calc\(var\(--catalog-list-pad\)\s*\*\s*-1\)/);
});
