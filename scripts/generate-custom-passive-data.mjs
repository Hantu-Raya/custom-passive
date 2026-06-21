import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { BINARY_KV3_BOOLEAN_FALSE } from '../src/lib/passiveFlagTemplate.js';
import { readPassiveFlagTemplate } from '../src/lib/source2PassiveFlags.js';
import { uncompressSource2Resource } from '../src/lib/source2BinaryKv3.js';

const ABILITIES_SOURCE = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/abilities.vdata';
const SR2_COMPILER = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/sr2compiler/New folder.exe';
const PAK01 = 'G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/pak01_dir.vpk';
const SOURCE2_VIEWER_CLI = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/.tmp/source2viewer-cli/Source2Viewer-CLI.exe';
const VPKEDIT_CLI = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/vpk cli/vpkeditcli.exe';

const MODS_LOCALIZATION_URL = 'https://raw.githubusercontent.com/SteamTracking/GameTracking-Deadlock/master/game/citadel/resource/localization/citadel_mods/citadel_mods_english.txt';
const GC_MOD_NAMES_LOCALIZATION = 'G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/resource/localization/citadel_gc_mod_names/citadel_gc_mod_names_english.txt';
const GC_MOD_NAMES_LOCALIZATION_URL = 'https://raw.githubusercontent.com/SteamTracking/GameTracking-Deadlock/master/game/citadel/resource/localization/citadel_gc_mod_names/citadel_gc_mod_names_english.txt';
const INCLUDE_PATTERN = /^\s*_include\s*=\s*\r?\n\s*\[\s*\r?\n(?:\s*resource_name:"[^"]+",?\s*\r?\n)+\s*\]\s*\r?\n/ms;
const PASSIVE_FLAG_LINE_PATTERN = /\n\s*m_bShowInPassiveItemsArea\s*=\s*(?:"(?:true|false)"|true|false)/g;
const TIER_COSTS = Object.freeze({ 1: 800, 2: 1600, 3: 3200, 4: 6400 });
const CATEGORY_BY_SLOT = Object.freeze({
  EItemSlotType_WeaponMod: 'weapon',
  EItemSlotType_Armor: 'vitality',
  EItemSlotType_Tech: 'spirit'
});
const REMOVE_FLAG_UPGRADES = Object.freeze([
  'upgrade_spellslinger_headshots',
  'upgrade_regenerating_bullet_shield',
  'upgrade_magic_shield',
  'upgrade_arcane_surge',
  'upgrade_kinetic_sash',
  'upgrade_chonky',
  'upgrade_critshot',
  'upgrade_close_quarter_combat',
  'upgrade_ultimate_burst',
  'upgrade_non_player_bonus_sacrifice',
  'upgrade_headshot_booster2',
  'upgrade_bulletshredimbue'
]);


function fail(message) {
  throw new Error(message);
}

async function assertReadable(filePath, label) {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) fail(`${label} is not a file: ${filePath}`);
  } catch (error) {
    fail(`${label} is missing or unreadable: ${filePath}\n${error?.message || error}`);
  }
}

function stripRootInclude(content) {
  const matches = [...content.matchAll(new RegExp(INCLUDE_PATTERN.source, INCLUDE_PATTERN.flags + (INCLUDE_PATTERN.flags.includes('g') ? '' : 'g')))];
  if (matches.length > 1) fail(`Expected at most one root _include block in ${ABILITIES_SOURCE}, found ${matches.length}`);
  return matches.length === 1 ? content.replace(INCLUDE_PATTERN, '') : content;
}

function iterRecordSpans(content) {
  const lines = content.match(/.*(?:\r?\n|$)/g) || [];
  const headerPattern = /^[ \t][A-Za-z0-9_]+\s*=\s*$/;
  const spans = [];
  let depth = 0;
  let offset = 0;
  let blockStart = null;
  let blockDepth = 0;

  for (const line of lines) {
    if (line.length === 0) continue;
    const lineEnd = offset + line.length;
    if (blockStart === null && depth === 1 && headerPattern.test(line.replace(/\r?\n$/, ''))) {
      blockStart = offset;
      blockDepth = depth;
    }

    if (blockStart !== null) {
      blockDepth += countChar(line, '{') - countChar(line, '}');
      if (blockDepth === 1 && line.trimStart().startsWith('}')) {
        spans.push({ start: blockStart, end: lineEnd, block: content.slice(blockStart, lineEnd) });
        blockStart = null;
      }
      depth = blockDepth;
    } else {
      depth += countChar(line, '{') - countChar(line, '}');
    }
    offset = lineEnd;
  }

  if (blockStart !== null) spans.push({ start: blockStart, end: content.length, block: content.slice(blockStart) });
  return spans;
}

function countChar(value, char) {
  let count = 0;
  for (let i = 0; i < value.length; i += 1) if (value[i] === char) count += 1;
  return count;
}

function recordName(block) {
  const match = block.match(/^[ \t]([A-Za-z0-9_]+)\s*=\s*$/m);
  return match?.[1] || '';
}

function firstMatch(block, regex) {
  return block.match(regex)?.[1] || '';
}
function imageRawFromBlock(block) {
  return firstMatch(block, /m_strShopIconLarge\s*=\s*((?:resource_name:|panorama:)?"[^"]+")/) || firstMatch(block, /m_strAbilityImage\s*=\s*((?:resource_name:|panorama:)?"[^"]+")/);
}

function isAvailableShopIcon(imagePath) {
  return /^items\/(?:weapon|vitality|spirit)\/[^/]+\.png$/i.test(imagePath);
}

function isCandidateBlock(name, block) {
  if (!name.startsWith('upgrade_')) return false;
  if (!block.includes('_multibase')) return false;
  if (/m_bDisabled\s*=\s*true/.test(block)) return false;
  if (!Object.keys(CATEGORY_BY_SLOT).some((slot) => block.includes(`m_eItemSlotType = "${slot}"`))) return false;
  if (!/m_iItemTier\s*=\s*"EModTier_[1-4]"/.test(block)) return false;
  if (!/m_eAbilityActivation\s*=\s*"CITADEL_ABILITY_ACTIVATION_[A-Z_]+"/.test(block)) return false;
  const imagePath = normalizeImagePath(imageRawFromBlock(block));
  return isAvailableShopIcon(imagePath);
}

function titleFromId(id) {
  return id.replace(/^upgrade_/, '').split('_').filter(Boolean).map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`).join(' ');
}

function activationBadge(block, name) {
  if (/imbue/i.test(name) || /imbue/i.test(block)) return 'imbue';
  const activation = firstMatch(block, /m_eAbilityActivation\s*=\s*"([^"]+)"/);
  return activation && activation !== 'CITADEL_ABILITY_ACTIVATION_PASSIVE' ? 'active' : '';
}

function normalizeImagePath(raw) {
  const cleaned = raw
    .replace(/^resource_name:/, '')
    .replace(/^panorama:/, '')
    .replace(/^"/, '')
    .replace(/"$/, '')
    .replace(/^file:\/\/\{images\}\//, '')
    .replace(/^panorama\/images\//, '')
    .replace(/\.psd$/i, '.png')
    .replace(/\.vtex_c$/i, '.png')
    .replace(/\\/g, '/');
  return cleaned.replace(/^\/+/, '');
}

function parseCandidate(span, localization) {
  const name = recordName(span.block);
  const slot = Object.keys(CATEGORY_BY_SLOT).find((value) => span.block.includes(`m_eItemSlotType = "${value}"`));
  const tier = Number(firstMatch(span.block, /m_iItemTier\s*=\s*"EModTier_([1-4])"/));
  const imageRaw = imageRawFromBlock(span.block);
  const token = name.toLowerCase();
  return {
    id: name,
    category: CATEGORY_BY_SLOT[slot],
    tier,
    cost: TIER_COSTS[tier],
    defaultSelected: /m_bShowInPassiveItemsArea\s*=\s*(?:"true"|true)/.test(span.block),
    legacyRemoveWarning: REMOVE_FLAG_UPGRADES.includes(name),
    activationBadge: activationBadge(span.block, name),
    label: localization.get(token) || titleFromId(name),
    description: localization.get(`${token}_desc`) || '',
    imagePath: normalizeImagePath(imageRaw),
    iconUrl: ''
  };
}
function parseLocalizationText(text, map) {
  const tokenPattern = /"([^"]+)"\s+"((?:\\.|[^"])*)"/g;
  for (const match of text.matchAll(tokenPattern)) {
    const key = match[1].replace(/^#/, '').toLowerCase();
    map.set(key, match[2].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim());
  }
}

async function readLocalizationSource(localPath, url) {
  if (localPath && existsSync(localPath)) return await readFile(localPath, 'utf8');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return await response.text();
}

async function loadLocalization() {
  const map = new Map();
  try {
    parseLocalizationText(await readLocalizationSource(null, MODS_LOCALIZATION_URL), map);
  } catch (error) {
    console.warn(`[warn] mod description localization failed; descriptions may be empty: ${error?.message || error}`);
  }
  try {
    parseLocalizationText(await readLocalizationSource(GC_MOD_NAMES_LOCALIZATION, GC_MOD_NAMES_LOCALIZATION_URL), map);
  } catch (error) {
    console.warn(`[warn] shop-name localization failed; falling back to generated labels: ${error?.message || error}`);
  }
  return map;
}

function withStablePassiveFlags(content, candidateIds) {
  const spans = iterRecordSpans(content);
  const pieces = [];
  let cursor = 0;
  const activationPattern = /m_eAbilityActivation\s*=\s*"CITADEL_ABILITY_ACTIVATION_[A-Z_]+"/;
  for (const span of spans) {
    const name = recordName(span.block);
    if (!candidateIds.has(name)) continue;
    let block = span.block.replace(PASSIVE_FLAG_LINE_PATTERN, '');
    const activationMatch = block.match(activationPattern);
    if (!activationMatch) fail(`Candidate ${name} is missing an ability activation line`);
    block = `${block.slice(0, activationMatch.index + activationMatch[0].length)}\n            m_bShowInPassiveItemsArea = false${block.slice(activationMatch.index + activationMatch[0].length)}`;
    pieces.push(content.slice(cursor, span.start), block);
    cursor = span.end;
  }
  pieces.push(content.slice(cursor));
  return pieces.join('');
}

async function runProcess(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 180000;
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options.spawn });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${path.basename(command)} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function compileTemplate(vdataContent) {
  const root = path.resolve('.tmp/custom-passive-compile');
  const sourceRoot = path.join(root, 'abilities');
  const sourcePath = path.join(sourceRoot, 'scripts/abilities.vdata');
  const compiledPath = path.join(root, 'abilities_compiled/scripts/abilities.vdata_c');
  await rm(root, { recursive: true, force: true });
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, vdataContent, 'utf8');
  const result = await runProcess(SR2_COMPILER, [sourceRoot], { timeoutMs: 180000 });
  if (result.code !== 0 && !existsSync(compiledPath)) {
    fail(`SR2 compiler failed with exit code ${result.code}\n${result.stderr || result.stdout}`);
  }
  if (!existsSync(compiledPath)) fail(`Compiled template not found: ${compiledPath}`);
  return new Uint8Array(await readFile(compiledPath));
}


function generatedDataSource(items, offsets) {
  return `export const DEADLOCK_ITEMS = Object.freeze(${JSON.stringify(items, null, 2)});\n\nexport const PASSIVE_FLAG_TYPE_OFFSETS = Object.freeze(${JSON.stringify(offsets, null, 2)});\n\nexport const TIER_COSTS = Object.freeze(${JSON.stringify(TIER_COSTS, null, 2)});\n`;
}

function decompiledPngPath(imagePath) {
  return `panorama/images/${imagePath.replace(/\.png$/i, '_psd.png')}`;
}

function webpPath(pngPath) {
  return pngPath.replace(/\.png$/i, '.webp');
}

function referencedShopSurfacePaths() {
  const paths = new Set([
    'panorama/images/shop/card_backer_png.png',
    'panorama/images/shop/catalog/backer_star_test_png.png',
    'panorama/images/shop/catalog/catalog_shop_builds_bg_psd.png',
    'panorama/images/shop/catalog/catalog_shop_bg_spirit_psd.png',
    'panorama/images/shop/catalog/catalog_shop_bg_vitality_psd.png',
    'panorama/images/shop/catalog/catalog_shop_bg_weapon_psd.png',
    'panorama/images/shop/catalog/catalog_shop_generic_bg_psd.png',
    'panorama/images/shop/catalog/catalog_shop_tab_icon_builds_psd.png',
    'panorama/images/shop/catalog/catalog_shop_tab_icon_spirit_psd.png',
    'panorama/images/shop/catalog/catalog_shop_tab_icon_vitality_psd.png',
    'panorama/images/shop/catalog/catalog_shop_tab_icon_weapon_psd.png',
    'panorama/images/shop/catalog/catalog_shop_tab_search_showing_sm_psd.png',
    'panorama/images/shop/catalog/catalog_tooltip_header_spirit_psd.png',
    'panorama/images/shop/catalog/catalog_tooltip_header_vitality_psd.png',
    'panorama/images/shop/catalog/catalog_tooltip_header_weapon_psd.png'
  ]);
  for (const category of ['spirit', 'vitality', 'weapon']) {
    for (let tier = 1; tier <= 4; tier += 1) paths.add(`panorama/images/shop/catalog/cards/card_backer_${category}_t${tier}_psd.png`);
  }
  for (let index = 1; index <= 3; index += 1) {
    paths.add(`panorama/images/shop/catalog/cards/icon_mask0${index}_psd.png`);
    paths.add(`panorama/images/shop/catalog/cards/shopitem_papertexture0${index}_psd.png`);
  }
  for (let index = 1; index <= 4; index += 1) paths.add(`panorama/images/shop/catalog/cards/shopitem_paperwear0${index}_psd.png`);
  return paths;
}

function referencedAssetPaths(items) {
  const paths = referencedShopSurfacePaths();
  for (const item of items) paths.add(decompiledPngPath(item.imagePath));
  return paths;
}

async function listFiles(root) {
  const out = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(fullPath));
    else out.push(fullPath);
  }
  return out;
}

async function pruneUnreferencedAssets(assetRoot, keepPaths) {
  const files = await listFiles(assetRoot);
  for (const file of files) {
    const relativePath = path.relative(assetRoot, file).replace(/\\/g, '/');
    if (!keepPaths.has(relativePath)) await rm(file, { force: true });
  }
}

async function convertPngToWebp(pngPath, outputPath) {
  const result = await runProcess(process.env.FFMPEG || 'ffmpeg', [
    '-y',
    '-loglevel', 'error',
    '-i', pngPath,
    '-c:v', 'libwebp',
    '-quality', '82',
    '-compression_level', '6',
    outputPath
  ], { timeoutMs: 120000 });
  if (result.code !== 0) fail(`ffmpeg failed while converting ${pngPath} to WebP`);
}

async function optimizeExtractedAssets(assetRoot, pngPaths) {
  let converted = 0;
  for (const pngPath of pngPaths) {
    const inputPath = path.join(assetRoot, pngPath);
    if (!existsSync(inputPath)) continue;
    const outputPath = path.join(assetRoot, webpPath(pngPath));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await convertPngToWebp(inputPath, outputPath);
    await rm(inputPath, { force: true });
    converted += 1;
  }
  console.log(`Optimized ${converted} Deadlock PNG assets to WebP.`);
}

async function maybeExtractAssets(items) {
  const assetRoot = path.resolve('public/assets/deadlock');
  await rm(assetRoot, { recursive: true, force: true });
  await mkdir(assetRoot, { recursive: true });
  const extractJobs = [
    { label: 'item icons', filter: 'panorama/images/items/' },
    { label: 'shop surfaces', filter: 'panorama/images/shop/' }
  ];
  for (const job of extractJobs) {
    try {
      const args = ['-i', PAK01, '-o', assetRoot, '-d', '-f', job.filter, '-e', 'vtex_c'];
      const result = await runProcess(SOURCE2_VIEWER_CLI, args, { timeoutMs: 120000 });
      if (result.code !== 0) console.warn(`[warn] Source2Viewer ${job.label} extraction failed with exit code ${result.code}; CSS/glyph fallbacks will be used.`);
    } catch (error) {
      console.warn(`[warn] Source2Viewer ${job.label} extraction failed; CSS/glyph fallbacks will be used: ${error?.message || error}`);
    }
  }
  const assetPaths = referencedAssetPaths(items);
  await pruneUnreferencedAssets(assetRoot, assetPaths);
  await optimizeExtractedAssets(assetRoot, assetPaths);
  for (const item of items) {
    const pngPath = decompiledPngPath(item.imagePath);
    const itemWebpPath = webpPath(pngPath);
    if (existsSync(path.join(assetRoot, itemWebpPath))) item.iconUrl = `assets/deadlock/${itemWebpPath}`;
    else if (existsSync(path.join(assetRoot, pngPath))) item.iconUrl = `assets/deadlock/${pngPath}`;
  }
}

async function main() {
  await Promise.all([
    assertReadable(ABILITIES_SOURCE, 'ABILITIES_SOURCE'),
    assertReadable(SR2_COMPILER, 'SR2_COMPILER'),
    assertReadable(PAK01, 'PAK01'),
    assertReadable(SOURCE2_VIEWER_CLI, 'SOURCE2_VIEWER_CLI'),
    assertReadable(VPKEDIT_CLI, 'VPKEDIT_CLI')
  ]);

  const localization = await loadLocalization();
  const rawContent = await readFile(ABILITIES_SOURCE, 'utf8');
  const content = stripRootInclude(rawContent);
  const candidates = iterRecordSpans(content).filter((span) => isCandidateBlock(recordName(span.block), span.block));
  if (candidates.length === 0) fail('No available shop item candidates found in abilities.vdata');
  const items = candidates.map((span) => parseCandidate(span, localization)).sort((a, b) => a.category.localeCompare(b.category) || a.tier - b.tier || a.label.localeCompare(b.label));
  const candidateIds = new Set(items.map((item) => item.id));
  const compileContent = withStablePassiveFlags(content, candidateIds);
  const compiled = await compileTemplate(compileContent);
  const template = uncompressSource2Resource(compiled, { decompressZstd: zstdDecompressSync });
  const offsets = readPassiveFlagTemplate(template, [...candidateIds]).offsets;
  const missing = items.filter((item) => offsets[item.id] === undefined).map((item) => item.id);
  if (missing.length > 0) fail(`Missing passive flag offsets for ${missing.length} item(s): ${missing.join(', ')}`);
  for (const item of items) {
    if (template[offsets[item.id]] !== BINARY_KV3_BOOLEAN_FALSE) fail(`Generated template byte for ${item.id} is ${template[offsets[item.id]]}, expected ${BINARY_KV3_BOOLEAN_FALSE}`);
  }
  await maybeExtractAssets(items);
  await mkdir('test/fixtures/templates/custom_passive/scripts', { recursive: true });
  await mkdir('src/data', { recursive: true });
  await writeFile('test/fixtures/templates/custom_passive/scripts/abilities.vdata_c.template', template);
  await writeFile('src/data/deadlockItems.generated.js', generatedDataSource(items, offsets));
  console.log(`Generated ${items.length} items and ${template.byteLength} template bytes.`);
}

await main();
