import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShopFilterTree } from '../scripts/lib/shopFilterTree.mjs';

const categories = ['Physical', 'Spirit', 'Defense', 'Mobility', 'Disruption', 'Misc'];
const localization = new Map([
  ...categories.map((category) => [`category_${category.toLowerCase()}`, category]),
  ['option', 'Option'],
  ['shopfilter_hintsecondary', 'Select<br>Expand'],
  ['citadelshopfilter_filtersactive', 'Active'],
  ['citadelshopfilter_clearfilters', 'Clear'],
  ['citadelshopfilter_filteror', 'OR']
]);
const rules = new Map(categories.flatMap((category) => [
  [`.FilterCategory.${category} .top_filter_img`, { 'background-image': 'url("s2r://panorama/images/filter.vtex")' }],
  [`@filter-color-${category === 'Spirit' ? 'Magic' : category}`, { color: '#ffffff' }]
]));
const oracle = { filters: Object.fromEntries(categories.map((category) => [`${category}/Option`, []])) };

function layout(nestedLabels) {
  return `<root><Panel id="FilterList">${categories.map((category) => {
    const token = `#category_${category}`;
    const control = nestedLabels
      ? `<ToggleButton filterGroup="Group${category}"><SyncedFontSizeLabel id="CategoryLabel" text="${token}" /></ToggleButton>`
      : `<ToggleButton filterGroup="Group${category}" text="${token}" />`;
    return `<Panel>${control}</Panel>`;
  }).join('')}</Panel>${categories.map((category) => `<Panel id="Group${category}"><ToggleButton filter="option" /></Panel>`).join('')}</root>`;
}

for (const nestedLabels of [false, true]) {
  test(`stock filter categories support ${nestedLabels ? 'nested synced' : 'direct'} labels`, () => {
    const result = parseShopFilterTree(layout(nestedLabels), rules, localization, [], oracle);
    assert.deepEqual(result.tree.map(({ id, token }) => ({ id, token })), categories.map((id) => ({ id, token: `category_${id}` })));
    assert.deepEqual(result.tree.map((category) => category.children[0].id), categories.map((id) => `${id}/Option`));
  });
}

test('stock category without a label fails explicitly', () => {
  const xml = layout(true).replace('text="#category_Physical"', '');
  assert.throws(() => parseShopFilterTree(xml, rules, localization, [], oracle), /Missing stock category label/);
});
