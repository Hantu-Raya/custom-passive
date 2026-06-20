import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path, { dirname } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { DEADLOCK_ITEMS } from '../src/data/deadlockItems.generated.js';
import { extractArchiveMember } from '../src/lib/archiveExtractor.js';
import { PRESET_TEMPLATES, REQUIRED_GAMEBANANA_TEMPLATE } from '../src/lib/presetTemplates.js';
import { readPassiveFlagSelectedItemIds } from '../src/lib/source2PassiveFlags.js';
import { uncompressSource2Resource } from '../src/lib/source2BinaryKv3.js';
import { readVpk } from '../src/lib/vpkReader.js';

const ABILITIES_SOURCE = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/abilities.vdata';
const ABILITIES_PASSIVE_SOURCE = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/abilities2.vdata';
const SR2_COMPILER = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/sr2compiler/New folder.exe';
const PASSIVE_TRANSFORM = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/passive.py';
const ACTIVE_TRANSFORM = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/active.py';
const ACTIVE_NO_BEHAVIOR_TRANSFORM = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/active_no_behavior.py';
const REQUIRED_TEMPLATE_ARCHIVE_PATH = `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`;
const PRESET_TEMPLATE_BY_ID = new Map(PRESET_TEMPLATES.map((preset) => [preset.id, preset]));

const PRESETS = Object.freeze([
  Object.freeze({
    id: 'passive-only',
    sourcePath: ABILITIES_PASSIVE_SOURCE,
    transformPath: PASSIVE_TRANSFORM,
    outputPath: 'public/templates/gamebanana/passive-only/scripts/abilities.vdata_c.template'
  }),
  Object.freeze({
    id: 'passive-and-active',
    sourcePath: ABILITIES_SOURCE,
    transformPath: ACTIVE_TRANSFORM,
    outputPath: 'public/templates/gamebanana/passive-and-active/scripts/abilities.vdata_c.template'
  }),
  Object.freeze({
    id: 'passive-and-active-no-behavior',
    sourcePath: ABILITIES_SOURCE,
    transformPath: ACTIVE_NO_BEHAVIOR_TRANSFORM,
    outputPath: 'public/templates/gamebanana/passive-and-active-no-behavior/scripts/abilities.vdata_c.template'
  })
]);

const PASSIVE_FLAG_LINE_PATTERN = /\n\s*m_bShowInPassiveItemsArea\s*=\s*(?:"(?:true|false)"|true|false)/g;
const CANDIDATE_IDS = new Set(DEADLOCK_ITEMS.map((item) => item.id));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(message);
}

function recordName(block) {
  const match = block.match(/^[ \t]([A-Za-z0-9_]+)\s*=\s*$/m);
  return match?.[1] || '';
}

function countChar(value, char) {
  let count = 0;
  for (const current of value) if (current === char) count += 1;
  return count;
}

function* iterRecordSpans(content) {
  const recordStartPattern = /^[ \t][A-Za-z0-9_]+\s*=\s*\r?\n[ \t]*\{/gm;
  for (const match of content.matchAll(recordStartPattern)) {
    const start = match.index;
    let cursor = start;
    let depth = 0;
    while (cursor < content.length) {
      const nextOpen = content.indexOf('{', cursor);
      const nextClose = content.indexOf('}', cursor);
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + 1;
      } else if (nextClose !== -1) {
        depth -= 1;
        cursor = nextClose + 1;
        if (depth === 0) {
          while (cursor < content.length && /[ \t\r\n]/.test(content[cursor])) cursor += 1;
          yield { start, end: cursor, block: content.slice(start, cursor) };
          break;
        }
      } else {
        fail(`Unterminated record near offset ${start}`);
      }
    }
  }
}

function withStablePassiveFlags(content) {
  const spans = iterRecordSpans(content);
  const pieces = [];
  let cursor = 0;
  const activationPattern = /m_eAbilityActivation\s*=\s*"CITADEL_ABILITY_ACTIVATION_[A-Z_]+"/;
  for (const span of spans) {
    const name = recordName(span.block);
    if (!CANDIDATE_IDS.has(name)) continue;
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

async function compileTemplate(vdataContent, presetId) {
  const root = path.resolve(`.tmp/custom-passive-preset-templates/${presetId}`);
  const sourceRoot = path.join(root, 'abilities');
  const sourcePath = path.join(sourceRoot, 'scripts/abilities.vdata');
  const compiledPath = path.join(root, 'abilities_compiled/scripts/abilities.vdata_c');
  await rm(root, { recursive: true, force: true });
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, vdataContent, 'utf8');
  const result = await runProcess(SR2_COMPILER, [sourceRoot], { timeoutMs: 180000 });
  if (result.code !== 0 && !existsSync(compiledPath)) {
    fail(`SR2 compiler failed with exit code ${result.code}\n${result.stderr || result.stdout}`);
  }
  if (!existsSync(compiledPath)) fail(`Compiled template not found: ${compiledPath}`);
  return new Uint8Array(await readFile(compiledPath));
}


async function transformedSource(preset) {
  const root = path.resolve(`.tmp/custom-passive-preset-sources/${preset.id}`);
  const sourcePath = path.join(root, 'abilities.vdata');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await writeFile(sourcePath, await readFile(preset.sourcePath, 'utf8'), 'utf8');
  const result = await runProcess('python', [preset.transformPath, sourcePath, sourcePath], { timeoutMs: 120000 });
  if (result.code !== 0) fail(`${path.basename(preset.transformPath)} failed with exit code ${result.code}\n${result.stderr || result.stdout}`);
  return await readFile(sourcePath, 'utf8');
}

async function verifyRequiredTemplateArchive() {
  const archiveBytes = new Uint8Array(await readFile(REQUIRED_TEMPLATE_ARCHIVE_PATH));
  const archiveSha256 = sha256(archiveBytes);
  if (archiveSha256 !== REQUIRED_GAMEBANANA_TEMPLATE.sha256) {
    fail(`${REQUIRED_GAMEBANANA_TEMPLATE.fileName} SHA-256 mismatch: got ${archiveSha256}, expected ${REQUIRED_GAMEBANANA_TEMPLATE.sha256}`);
  }
  return archiveSha256;
}

async function verifyPresetSelection(preset) {
  const metadata = PRESET_TEMPLATE_BY_ID.get(preset.id);
  if (!metadata) fail(`Missing preset metadata for ${preset.id}`);
  const archivePath = `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/${metadata.sourceArchive.fileName}`;
  const archiveBytes = new Uint8Array(await readFile(archivePath));
  const archiveSha256 = sha256(archiveBytes);
  if (archiveSha256 !== metadata.sourceArchive.sha256) {
    fail(`${metadata.sourceArchive.fileName} SHA-256 mismatch: got ${archiveSha256}, expected ${metadata.sourceArchive.sha256}`);
  }
  const vpkBytes = await extractArchiveMember(archiveBytes, metadata.sourceArchive.fileName, metadata.sourceArchive.archiveMember);
  const vdataBytes = readVpk(vpkBytes).find((file) => file.path === 'scripts/abilities.vdata_c')?.bytes;
  if (!vdataBytes) fail(`${metadata.sourceArchive.fileName} is missing scripts/abilities.vdata_c`);
  const normalizedVdataBytes = uncompressSource2Resource(vdataBytes, { decompressZstd: zstdDecompressSync });
  const selectedItemIds = readPassiveFlagSelectedItemIds(normalizedVdataBytes, DEADLOCK_ITEMS.map((item) => item.id));
  if (JSON.stringify(selectedItemIds) !== JSON.stringify(metadata.presetItemIds)) {
    fail(`${metadata.sourceArchive.fileName} preset item ids changed: got ${selectedItemIds.length}, expected ${metadata.presetItemIds.length}`);
  }
  return { archiveSha256, selectedCount: selectedItemIds.length };
}

async function buildPresetTemplate(preset) {
  const compiled = await compileTemplate(withStablePassiveFlags(await transformedSource(preset)), preset.id);
  const templateBytes = uncompressSource2Resource(compiled, { decompressZstd: zstdDecompressSync });
  await mkdir(dirname(preset.outputPath), { recursive: true });
  await writeFile(preset.outputPath, templateBytes);
  return {
    id: preset.id,
    outputPath: preset.outputPath,
    templateSha256: sha256(templateBytes),
    bytes: templateBytes.byteLength
  };
}

const archiveSha256 = await verifyRequiredTemplateArchive();
console.log(`${REQUIRED_GAMEBANANA_TEMPLATE.fileName}: verified archive sha256 ${archiveSha256}`);
for (const preset of PRESETS) {
  const selection = await verifyPresetSelection(preset);
  console.log(`${preset.id}: verified ${selection.selectedCount} selected ids from source archive sha256 ${selection.archiveSha256}`);
  const result = await buildPresetTemplate(preset);
  console.log(`${result.id}: wrote ${result.outputPath} (${result.bytes} bytes, template sha256 ${result.templateSha256})`);
}
