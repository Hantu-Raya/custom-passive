// Source2Viewer reconstructs this layout as element-only XML with quoted attributes.
function parseLayout(xml) {
  const root = { children: [] };
  const stack = [root];
  for (const match of xml.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/)?([\w]+)\b([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attributes, selfClosing] = match;
    if (closing) {
      if (stack.pop()?.tag !== tag) throw new Error(`Unbalanced stock filter XML: ${tag}`);
      continue;
    }
    const attrs = Object.fromEntries([...attributes.matchAll(/([\w]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('Unclosed stock filter XML');
  return root;
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

export function parseShopFilterTree(xml, rules, localization, items, oracle) {
  const nodes = descendants(parseLayout(xml));
  const byId = new Map(nodes.filter((node) => node.attrs.id).map((node) => [node.attrs.id, node]));
  const label = (token) => {
    const value = localization.get(token.replace(/^#/, '').toLowerCase());
    if (!value) throw new Error(`Missing English stock filter token: ${token}`);
    return value;
  };
  const asset = (selector) => {
    const value = rules.get(selector)?.['background-image'];
    const member = value?.match(/s2r:\/\/(panorama\/images\/[^"')]+)\.(vtex|vsvg)/);
    if (!member) throw new Error(`Missing stock filter icon: ${selector}`);
    return `assets/deadlock/${member[1]}.${member[2] === 'vsvg' ? 'svg' : 'webp'}`;
  };
  const buildChildren = (panel, category, categoryIcon) => {
    if (!panel) throw new Error(`Missing stock filter group in ${category}`);
    return panel.children.filter((node) => node.tag === 'ToggleButton' && (node.attrs.filter || node.attrs.filterGroup)).map((node) => {
      const token = node.attrs.text || node.attrs.filter;
      const displayLabel = label(token);
      const iconClass = node.children.find((child) => child.attrs.id === 'filter_icon')?.attrs.class?.split(/\s+/).find((value) => value !== 'PropertiesIcon');
      const entry = {
        id: `${category}/${displayLabel}`, label: displayLabel, token: token.replace(/^#/, ''),
        stockId: node.attrs.filter || node.attrs.filterGroup,
        iconUrl: iconClass ? asset(`.PropertiesIcon.${iconClass}`) : categoryIcon
      };
      if (node.attrs.filterGroup) entry.children = buildChildren(byId.get(node.attrs.filterGroup), category, categoryIcon);
      return entry;
    });
  };
  const categories = byId.get('FilterList')?.children;
  if (!categories) throw new Error('Missing stock FilterList');
  const tree = categories.map((node) => {
    const control = descendants(node).find((child) => child.attrs.filterGroup);
    if (!control) throw new Error('Missing stock category group control');
    const category = label(control.attrs.text);
    const iconUrl = asset(`.FilterCategory.${category} .top_filter_img`);
    const colorName = category === 'Spirit' ? 'Magic' : category;
    const color = rules.get(`@filter-color-${colorName}`)?.color;
    if (!color) throw new Error(`Missing stock filter color: ${colorName}`);
    return { id: category, label: category, token: control.attrs.text.slice(1), stockId: control.attrs.filterGroup, iconUrl, color, children: buildChildren(byId.get(control.attrs.filterGroup), category, iconUrl) };
  });
  const categoryOrder = ['Physical', 'Spirit', 'Defense', 'Mobility', 'Disruption', 'Misc'];
  if (tree.length !== categoryOrder.length || tree.some((node, index) => node.id !== categoryOrder[index])) throw new Error('Unexpected stock filter category order');
  const entries = tree.flatMap((category) => [category, ...descendantsOfFilter(category)]);
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error('Duplicate stock filter ids');
  for (const item of items) for (const id of item.shopFilters) {
    if (!ids.has(id)) throw new Error(`Item filter missing from stock tree: ${item.id}: ${id}`);
  }
  const oracleIds = new Set(Object.keys(oracle.filters));
  const optionIds = new Set(entries.filter((entry) => entry.id.includes('/')).map((entry) => entry.id));
  if (optionIds.size !== oracleIds.size || [...oracleIds].some((id) => !optionIds.has(id))) throw new Error('Stock filter tree differs from oracle keys');
  for (const entry of entries.filter((entry) => !entry.children)) {
    if (!oracleIds.has(entry.id)) throw new Error(`Stock tree leaf missing from oracle: ${entry.id}`);
  }
  for (const entry of entries.filter((node) => node.id.includes('/'))) {
    const leaves = new Set([entry, ...descendantsOfFilter(entry)].filter((node) => !node.children).map((node) => node.id));
    const actual = items.filter((item) => item.shopFilters.some((id) => leaves.has(id))).map((item) => item.id).sort();
    const expected = [...oracle.filters[entry.id]].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Stock filter membership differs from oracle: ${entry.id}`);
  }
  const helpToken = 'ShopFilter_HintSecondary';
  const helpLines = label(helpToken).replace(/\{g:citadel_key:'MOUSE1'\}/g, 'Left click / Enter').replace(/\{g:citadel_key:'MOUSE2'\}/g, 'Right click / Ctrl+Enter').split(/<br\s*\/?\s*>/i);
  if (helpLines.length !== 2) throw new Error('Expected two stock filter help lines');
  return {
    tree,
    ui: { activeLabel: label('CitadelShopFilter_FiltersActive'), clearLabel: label('CitadelShopFilter_ClearFilters'), orLabel: label('CitadelShopFilter_FilterOr'), helpToken, helpLines },
    assetPaths: new Set(entries.map((entry) => entry.iconUrl.replace(/^assets\/deadlock\//, '').replace(/\.webp$/, '.png')))
  };
}

function descendantsOfFilter(node) {
  return (node.children || []).flatMap((child) => [child, ...descendantsOfFilter(child)]);
}

export function frozenSource(value) {
  if (Array.isArray(value)) return `Object.freeze([${value.map(frozenSource).join(',\n')}])`;
  if (value && typeof value === 'object') return `Object.freeze({${Object.entries(value).map(([key, child]) => `${JSON.stringify(key)}: ${frozenSource(child)}`).join(',\n')}})`;
  return JSON.stringify(value);
}
