import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path, { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import {
  GAMEBANANA_MOD_SOURCE as CURRENT_MOD_SOURCE,
  GAMEBANANA_PRESET_SOURCES as CURRENT_PRESET_SOURCES,
  REQUIRED_GAMEBANANA_TEMPLATE_SOURCE as CURRENT_REQUIRED_TEMPLATE_SOURCE
} from '../src/data/gamebananaSources.generated.js';
import { extractArchiveMember } from '../src/lib/archiveExtractor.js';
import { assertCompletePassiveFlagOffsets, readPassiveFlagSelectedItemIds, readPassiveFlagTemplate } from '../src/lib/source2PassiveFlags.js';
import { uncompressSource2Resource } from '../src/lib/source2BinaryKv3.js';
import { readVpk } from '../src/lib/vpkReader.js';

export const GAMEBANANA_MOD_ID = 601444;
export const GAMEBANANA_MOD_API_URL = `https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${GAMEBANANA_MOD_ID}&fields=name,udate,mdate,Files().aFiles(),Updates().aLatestUpdates(),Url().sProfileUrl()&return_keys=1&format=json_min`;

const GENERATED_METADATA_PATH = 'src/data/gamebananaSources.generated.js';
const CACHE_ROOT = `.tmp/gamebanana/${GAMEBANANA_MOD_ID}`;
const CANDIDATE_ITEM_IDS = DEADLOCK_ITEMS.map((item) => item.id);

const PRESET_SPECS = Object.freeze({
  passiveOnly: Object.freeze({
    id: 'passive-only',
    role: 'passive-only',
    label: 'Passive Only',
    archiveMember: 'pak04_dir.vpk',
    outputFileName: 'pak04_dir.vpk',
    templatePath: 'templates/gamebanana/passive-only/scripts/abilities.vdata_c.template'
  }),
  passiveAndActive: Object.freeze({
    id: 'passive-and-active',
    role: 'passive-and-active',
    label: 'Passive + Actives',
    archiveMember: 'pak03_dir.vpk',
    outputFileName: 'pak03_dir.vpk',
    templatePath: 'templates/gamebanana/passive-and-active/scripts/abilities.vdata_c.template'
  }),
  passiveAndActiveNoBehavior: Object.freeze({
    id: 'passive-and-active-no-behavior',
    role: 'passive-and-active-no-behavior',
    label: 'Passive + Actives (No Behavior)',
    archiveMember: 'pak05_dir.vpk',
    outputFileName: 'pak05_dir.vpk',
    templatePath: 'templates/gamebanana/passive-and-active-no-behavior/scripts/abilities.vdata_c.template'
  })
});

const REQUIRED_FILTER_KEYS = Object.freeze(['passiveOnly', 'passiveAndActive', 'passiveAndActiveNoBehavior']);

function fail(message) {
  throw new Error(message);
}

function hash(bytes, algorithm) {
  return createHash(algorithm).update(bytes).digest('hex');
}

function dateTagRank(dateTag) {
  const match = /^(\d{2})_(\d{2})$/.exec(dateTag || '');
  if (!match) return -1;
  return Number(match[1]) * 100 + Number(match[2]);
}

function sortObjectKeys(value) {
  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

function normalizeFile(rawFile) {
  return Object.freeze({
    id: String(rawFile._idRow || rawFile.id || ''),
    fileName: String(rawFile._sFile || rawFile.fileName || ''),
    size: Number(rawFile._nFilesize || rawFile.size || 0),
    dateAdded: Number(rawFile._tsDateAdded || rawFile.dateAdded || 0),
    downloadUrl: String(rawFile._sDownloadUrl || rawFile.downloadUrl || ''),
    md5: String(rawFile._sMd5Checksum || rawFile.md5 || '').toLowerCase(),
    isArchived: Boolean(rawFile._bIsArchived ?? rawFile.isArchived),
    hasContents: Boolean(rawFile._bHasContents ?? rawFile.hasContents ?? true)
  });
}

export function normalizeGameBananaFiles(apiPayload) {
  const files = apiPayload?.['Files().aFiles()'];
  if (!files || typeof files !== 'object') fail('GameBanana response is missing Files().aFiles()');
  return Object.freeze(Object.values(files).map(normalizeFile));
}

export function classifyGameBananaFile(fileName) {
  const name = String(fileName || '');
  let match = /^filter_for_passive_items_(\d{2}_\d{2})\.7z$/i.exec(name);
  if (match) return Object.freeze({ key: 'passiveOnly', role: 'passive-only', dateTag: match[1] });

  match = /^filter_for_passive_and_active_items_yes_?behaviou?r_(\d{2}_\d{2})\.7z$/i.exec(name);
  if (match) return Object.freeze({ key: 'passiveAndActive', role: 'passive-and-active', dateTag: match[1] });

  match = /^filter_for_passive_and_active_items_(\d{2}_\d{2})\.7z$/i.exec(name);
  if (match) return Object.freeze({ key: 'passiveAndActiveNoBehavior', role: 'passive-and-active-no-behavior', dateTag: match[1] });

  match = /^(?:template|templete)_(\d{2}_\d{2})\.7z$/i.exec(name);
  if (match) return Object.freeze({ key: 'requiredTemplate', role: 'required-template', dateTag: match[1] });

  return null;
}

function betterFile(left, right) {
  if (!left) return right;
  if (left.isArchived !== right.isArchived) return left.isArchived ? right : left;
  if (left.dateAdded !== right.dateAdded) return left.dateAdded > right.dateAdded ? left : right;
  return Number(left.id) >= Number(right.id) ? left : right;
}

export function selectLatestGameBananaFiles(files, options = {}) {
  const requireTemplate = options.requireTemplate !== false;
  const groups = new Map();
  let latestTemplate = null;

  for (const file of files) {
    const classified = classifyGameBananaFile(file.fileName);
    if (!classified) continue;
    const tagged = Object.freeze({ ...file, ...classified });
    if (classified.key === 'requiredTemplate') {
      latestTemplate = betterFile(latestTemplate, tagged);
      continue;
    }
    const group = groups.get(classified.dateTag) || {};
    group[classified.key] = betterFile(group[classified.key], tagged);
    groups.set(classified.dateTag, group);
  }

  const completeGroups = [...groups.entries()]
    .map(([dateTag, group]) => ({ dateTag, group }))
    .filter(({ group }) => REQUIRED_FILTER_KEYS.every((key) => group[key]));
  if (completeGroups.length === 0) fail('GameBanana has no complete passive filter batch');

  completeGroups.sort((left, right) => {
    const leftActive = REQUIRED_FILTER_KEYS.every((key) => !left.group[key].isArchived);
    const rightActive = REQUIRED_FILTER_KEYS.every((key) => !right.group[key].isArchived);
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    const dateDelta = dateTagRank(right.dateTag) - dateTagRank(left.dateTag);
    if (dateDelta !== 0) return dateDelta;
    const leftTs = Math.max(...REQUIRED_FILTER_KEYS.map((key) => left.group[key].dateAdded));
    const rightTs = Math.max(...REQUIRED_FILTER_KEYS.map((key) => right.group[key].dateAdded));
    return rightTs - leftTs;
  });

  const selected = completeGroups[0];
  const matchingTemplate = latestTemplate?.dateTag === selected.dateTag ? latestTemplate : null;
  if (requireTemplate && !matchingTemplate) fail(`GameBanana has no required template archive for filter batch ${selected.dateTag}`);

  return Object.freeze({
    batchDateTag: selected.dateTag,
    filters: Object.freeze({
      passiveOnly: selected.group.passiveOnly,
      passiveAndActive: selected.group.passiveAndActive,
      passiveAndActiveNoBehavior: selected.group.passiveAndActiveNoBehavior
    }),
    requiredTemplate: matchingTemplate || latestTemplate || null
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`GameBanana API returned HTTP ${response.status}`);
  return await response.json();
}

async function downloadFile(file, options = {}) {
  if (!file.downloadUrl) fail(`${file.fileName} has no download URL`);
  const response = await fetch(file.downloadUrl);
  if (!response.ok) fail(`Could not download ${file.fileName}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const md5 = hash(bytes, 'md5');
  if (file.md5 && md5 !== file.md5) fail(`${file.fileName} MD5 mismatch: got ${md5}, expected ${file.md5}`);
  const cachePath = path.join(CACHE_ROOT, file.id || 'unknown', file.fileName);
  if (!options.dryRun) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, bytes);
  }
  return Object.freeze({ bytes, md5, sha256: hash(bytes, 'sha256'), cachePath });
}

function vdataFromVpk(vpkBytes, archiveName) {
  const vdata = readVpk(vpkBytes).find((file) => file.path === 'scripts/abilities.vdata_c')?.bytes;
  if (!vdata) fail(`${archiveName} is missing scripts/abilities.vdata_c`);
  return vdata;
}

async function templateFromArchive(archiveBytes, source) {
  const vpkBytes = await extractArchiveMember(archiveBytes, source.fileName, source.archiveMember);
  const vdataBytes = vdataFromVpk(vpkBytes, source.fileName);
  return uncompressSource2Resource(vdataBytes, { decompressZstd: zstdDecompressSync });
}

async function patchableTemplateBytes(candidateBytes, spec, sourceFileName, sourceDateTag) {
  try {
    const parsed = readPassiveFlagTemplate(candidateBytes, CANDIDATE_ITEM_IDS);
    assertCompletePassiveFlagOffsets(parsed.offsets, CANDIDATE_ITEM_IDS);
    return { bytes: candidateBytes, shouldWrite: true };
  } catch (error) {
    if (sourceDateTag !== currentBatchDateTag()) {
      fail(`${sourceFileName} cannot be used as a full patch template for every shop item. Run npm run generate:presets with updated local Deadlock files before deploying batch ${sourceDateTag}.`);
    }
    const fallbackPath = path.join('public', spec.templatePath);
    const fallbackBytes = new Uint8Array(await readFile(fallbackPath));
    const parsed = readPassiveFlagTemplate(fallbackBytes, CANDIDATE_ITEM_IDS);
    assertCompletePassiveFlagOffsets(parsed.offsets, CANDIDATE_ITEM_IDS);
    console.warn(`[warn] ${sourceFileName} uses non-boolean passive flag values; keeping generated patchable template ${spec.templatePath}. Run npm run generate:presets after local source files update.`);
    return { bytes: fallbackBytes, shouldWrite: false };
  }
}

function generatedFileRecord(file, downloaded, extra = {}) {
  return {
    fileId: file.id || null,
    fileName: file.fileName,
    dateTag: file.dateTag,
    downloadUrl: file.downloadUrl || null,
    md5: downloaded.md5,
    sha256: downloaded.sha256,
    size: file.size || downloaded.bytes.byteLength,
    ...extra
  };
}

function jsString(value) {
  return JSON.stringify(value);
}

function emitArray(values, indent = '    ') {
  if (!values || values.length === 0) return 'Object.freeze([])';
  return `Object.freeze([\n${values.map((value) => `${indent}${jsString(value)}`).join(',\n')}\n${indent.slice(2)}])`;
}

function emitRecord(record, indent = '  ') {
  const lines = [];
  for (const key of sortObjectKeys(record)) {
    const value = record[key];
    if (Array.isArray(value)) lines.push(`${indent}${key}: ${emitArray(value, `${indent}  `)}`);
    else lines.push(`${indent}${key}: ${jsString(value)}`);
  }
  return lines.join(',\n');
}

export function metadataModuleContent({ modSource, requiredTemplate, presetSources }) {
  const presetOrder = ['passiveOnly', 'passiveAndActive', 'passiveAndActiveNoBehavior'];
  return `export const GAMEBANANA_MOD_SOURCE = Object.freeze({\n${emitRecord(modSource)}\n});\n\nexport const REQUIRED_GAMEBANANA_TEMPLATE_SOURCE = Object.freeze({\n${emitRecord(requiredTemplate)}\n});\n\nexport const GAMEBANANA_PRESET_SOURCES = Object.freeze({\n${presetOrder.map((key) => `  ${key}: Object.freeze({\n${emitRecord(presetSources[key], '    ')}\n  })`).join(',\n')}\n});\n`;
}

function currentBatchDateTag() {
  return CURRENT_MOD_SOURCE.batchDateTag || CURRENT_PRESET_SOURCES.passiveOnly.dateTag || null;
}

function assertNoDowngrade(selectedDateTag, allowDowngrade) {
  const current = currentBatchDateTag();
  if (!current || allowDowngrade) return;
  if (dateTagRank(selectedDateTag) < dateTagRank(current)) {
    fail(`GameBanana latest complete batch ${selectedDateTag} is older than current generated batch ${current}. Re-run with --allow-downgrade if this is intentional.`);
  }
}

async function buildMetadata(selection, options = {}) {
  const requiredTemplate = selection.requiredTemplate
    ? generatedFileRecord(selection.requiredTemplate, await downloadFile(selection.requiredTemplate, options), {
      role: 'required-template',
      archiveMember: 'pak02_dir.vpk'
    })
    : CURRENT_REQUIRED_TEMPLATE_SOURCE;

  const presetSources = {};
  for (const key of REQUIRED_FILTER_KEYS) {
    const spec = PRESET_SPECS[key];
    const file = Object.freeze({ ...selection.filters[key], archiveMember: spec.archiveMember });
    const downloaded = await downloadFile(file, options);
    const archiveTemplateBytes = await templateFromArchive(downloaded.bytes, file);
    const selectedItemIds = readPassiveFlagSelectedItemIds(archiveTemplateBytes, CANDIDATE_ITEM_IDS);
    const template = await patchableTemplateBytes(archiveTemplateBytes, spec, file.fileName, file.dateTag);
    const templateSha256 = hash(template.bytes, 'sha256');
    const outputPath = path.join('public', spec.templatePath);
    if (!options.dryRun && template.shouldWrite) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, template.bytes);
    }
    presetSources[key] = Object.freeze({
      id: spec.id,
      role: spec.role,
      label: spec.label,
      ...generatedFileRecord(file, downloaded, {
        archiveMember: spec.archiveMember,
        outputFileName: spec.outputFileName,
        archiveOutputFileName: file.fileName,
        templatePath: spec.templatePath,
        templateSha256,
        presetItemIds: selectedItemIds
      })
    });
  }

  return Object.freeze({ requiredTemplate, presetSources });
}

function parseArgs(argv) {
  return Object.freeze({
    allowDowngrade: argv.includes('--allow-downgrade'),
    allowMissingTemplate: argv.includes('--allow-missing-template'),
    dryRun: argv.includes('--dry-run')
  });
}

export async function syncGameBananaMod(options = {}) {
  const apiPayload = await fetchJson(GAMEBANANA_MOD_API_URL);
  const files = normalizeGameBananaFiles(apiPayload);
  const selection = selectLatestGameBananaFiles(files, {
    requireTemplate: options.allowMissingTemplate !== true
  });
  assertNoDowngrade(selection.batchDateTag, options.allowDowngrade === true);

  if (!selection.requiredTemplate && options.allowMissingTemplate) {
    console.warn(`[warn] GameBanana did not publish a template archive for ${selection.batchDateTag}; keeping ${CURRENT_REQUIRED_TEMPLATE_SOURCE.fileName}.`);
  }

  const { requiredTemplate, presetSources } = await buildMetadata(selection, options);
  const modSource = Object.freeze({
    id: GAMEBANANA_MOD_ID,
    name: apiPayload.name || CURRENT_MOD_SOURCE.name,
    url: apiPayload['Url().sProfileUrl()'] || CURRENT_MOD_SOURCE.url,
    apiUrl: GAMEBANANA_MOD_API_URL,
    syncedAt: new Date().toISOString(),
    batchDateTag: selection.batchDateTag,
    udate: apiPayload.udate || null,
    mdate: apiPayload.mdate || null
  });

  const content = metadataModuleContent({ modSource, requiredTemplate, presetSources });
  if (!options.dryRun) await writeFile(GENERATED_METADATA_PATH, content);
  return Object.freeze({ modSource, requiredTemplate, presetSources });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await syncGameBananaMod(options);
  console.log(`Selected GameBanana batch ${result.modSource.batchDateTag}.`);
  for (const key of REQUIRED_FILTER_KEYS) {
    const source = result.presetSources[key];
    console.log(`${source.label}: ${source.fileName} (${source.presetItemIds.length} selected, sha256 ${source.sha256})`);
  }
  console.log(`Template gate: ${result.requiredTemplate.fileName} (sha256 ${result.requiredTemplate.sha256})`);
  if (options.dryRun) console.log('Dry run only; no files were updated.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
