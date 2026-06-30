import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  classifyGameBananaFile,
  downloadFile,
  metadataModuleContent,
  normalizeGameBananaFiles,
  patchableTemplateBytes,
  selectLatestGameBananaFiles
} from '../scripts/sync-gamebanana-mod.mjs';

function gamebananaFile(id, fileName, options = {}) {
  return {
    _idRow: String(id),
    _sFile: fileName,
    _nFilesize: options.size ?? 100,
    _tsDateAdded: options.dateAdded ?? id,
    _sDownloadUrl: `https://gamebanana.com/dl/${id}`,
    _sMd5Checksum: options.md5 ?? '0123456789abcdef0123456789abcdef',
    _bIsArchived: options.isArchived ?? false,
    _bHasContents: true
  };
}

const API_FIXTURE = Object.freeze({
  'Files().aFiles()': Object.freeze({
    1: gamebananaFile(1, 'filter_for_passive_items_06_18.7z', { isArchived: true }),
    2: gamebananaFile(2, 'filter_for_passive_and_active_items_yesbehaviour_06_18.7z', { isArchived: true }),
    3: gamebananaFile(3, 'filter_for_passive_and_active_items_06_18.7z', { isArchived: true }),
    4: gamebananaFile(4, 'filter_for_passive_items_06_19.7z'),
    5: gamebananaFile(5, 'filter_for_passive_and_active_items_yesBehaviour_06_19.7z'),
    6: gamebananaFile(6, 'filter_for_passive_and_active_items_06_19.7z'),
    7: gamebananaFile(7, 'templete_06_19.7z'),
    8: gamebananaFile(8, 'standalone_passive_items_06_19.7z')
  })
});

test('classifies GameBanana archive names used by the mod', () => {
  assert.deepEqual(classifyGameBananaFile('filter_for_passive_items_06_19.7z'), {
    key: 'passiveOnly',
    role: 'passive-only',
    dateTag: '06_19'
  });
  assert.deepEqual(classifyGameBananaFile('filter_for_passive_and_active_items_yes_behavior_06_19.7z'), {
    key: 'passiveAndActive',
    role: 'passive-and-active',
    dateTag: '06_19'
  });
  assert.deepEqual(classifyGameBananaFile('filter_for_passive_and_active_items_yesbehaviour_06_19.7z'), {
    key: 'passiveAndActive',
    role: 'passive-and-active',
    dateTag: '06_19'
  });
  assert.deepEqual(classifyGameBananaFile('filter_for_passive_and_active_items_06_19.7z'), {
    key: 'passiveAndActiveNoBehavior',
    role: 'passive-and-active-no-behavior',
    dateTag: '06_19'
  });
  assert.deepEqual(classifyGameBananaFile('template_06_19.7z'), {
    key: 'requiredTemplate',
    role: 'required-template',
    dateTag: '06_19'
  });
  assert.deepEqual(classifyGameBananaFile('templete_06_19.7z'), {
    key: 'requiredTemplate',
    role: 'required-template',
    dateTag: '06_19'
  });
  assert.equal(classifyGameBananaFile('standalone_passive_items_06_19.7z'), null);
});

test('selects the newest complete active GameBanana filter batch', () => {
  const files = normalizeGameBananaFiles(API_FIXTURE);
  const selected = selectLatestGameBananaFiles(files);
  assert.equal(selected.batchDateTag, '06_19');
  assert.equal(selected.filters.passiveOnly.fileName, 'filter_for_passive_items_06_19.7z');
  assert.equal(selected.filters.passiveAndActive.fileName, 'filter_for_passive_and_active_items_yesBehaviour_06_19.7z');
  assert.equal(selected.filters.passiveAndActiveNoBehavior.fileName, 'filter_for_passive_and_active_items_06_19.7z');
  assert.equal(selected.requiredTemplate.fileName, 'templete_06_19.7z');
});

test('requires a matching template unless explicitly relaxed', () => {
  const files = normalizeGameBananaFiles({
    'Files().aFiles()': {
      1: gamebananaFile(1, 'filter_for_passive_items_06_20.7z'),
      2: gamebananaFile(2, 'filter_for_passive_and_active_items_yesbehaviour_06_20.7z'),
      3: gamebananaFile(3, 'filter_for_passive_and_active_items_06_20.7z')
    }
  });
  assert.throws(() => selectLatestGameBananaFiles(files), /no required template archive/);
  assert.equal(selectLatestGameBananaFiles(files, { requireTemplate: false }).batchDateTag, '06_20');
});

test('uses the matching GameBanana template when a newer filter archive is not patchable', async () => {
  const fallbackBytes = new Uint8Array(await readFile('public/templates/gamebanana/passive-only/scripts/abilities.vdata_c.template'));
  const result = await patchableTemplateBytes(new Uint8Array(), {
    templatePath: 'templates/gamebanana/passive-only/scripts/abilities.vdata_c.template'
  }, 'filter_for_passive_items_07_01.7z', '07_01', {
    fallbackTemplateBytes: fallbackBytes,
    fallbackTemplateName: 'templete_07_01.7z'
  });

  assert.equal(result.shouldWrite, true);
  assert.equal(result.bytes, fallbackBytes);
});

test('keeps the generated patchable template when GameBanana archives are incomplete', async () => {
  const result = await patchableTemplateBytes(new Uint8Array(), {
    templatePath: 'templates/gamebanana/passive-only/scripts/abilities.vdata_c.template'
  }, 'filter_for_passive_items_07_01.7z', '07_01', {
    fallbackTemplateBytes: new Uint8Array(),
    fallbackTemplateName: 'templete_07_01.7z'
  });

  assert.equal(result.shouldWrite, false);
  assert.ok(result.bytes.byteLength > 0);
});

test('retries transient GameBanana download errors', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    if (calls === 1) return new Response('', { status: 522 });
    return new Response(new Uint8Array([1, 2, 3]));
  });

  const downloaded = await downloadFile({
    id: 'fixture',
    fileName: 'templete_07_01.7z',
    downloadUrl: 'https://gamebanana.com/dl/fixture',
    md5: '5289df737df57326fcdd22597afb1fac'
  }, {
    dryRun: true,
    downloadAttempts: 2,
    retryDelayMs: 0
  });

  assert.equal(calls, 2);
  assert.equal(downloaded.bytes.byteLength, 3);
});

test('renders static generated metadata without runtime API dependency', () => {
  const content = metadataModuleContent({
    modSource: {
      id: 601444,
      name: 'Always Show Passive Items and Actives Icons',
      url: 'https://gamebanana.com/mods/601444',
      apiUrl: 'https://api.gamebanana.com/Core/Item/Data',
      syncedAt: '2026-06-20T00:00:00.000Z',
      batchDateTag: '06_19'
    },
    requiredTemplate: {
      role: 'required-template',
      fileName: 'templete_06_19.7z',
      dateTag: '06_19',
      downloadUrl: 'https://gamebanana.com/dl/7',
      md5: 'md5',
      sha256: 'sha',
      size: 10,
      archiveMember: 'pak02_dir.vpk'
    },
    presetSources: {
      passiveOnly: { id: 'passive-only', role: 'passive-only', label: 'Passive Only', fileName: 'filter_for_passive_items_06_19.7z', presetItemIds: ['a'] },
      passiveAndActive: { id: 'passive-and-active', role: 'passive-and-active', label: 'Passive + Actives', fileName: 'filter_for_passive_and_active_items_yesBehaviour_06_19.7z', presetItemIds: ['a', 'b'] },
      passiveAndActiveNoBehavior: { id: 'passive-and-active-no-behavior', role: 'passive-and-active-no-behavior', label: 'Passive + Actives (No Behavior)', fileName: 'filter_for_passive_and_active_items_06_19.7z', presetItemIds: ['a', 'b'] }
    }
  });
  assert.match(content, /export const GAMEBANANA_MOD_SOURCE/);
  assert.match(content, /GAMEBANANA_PRESET_SOURCES/);
  assert.doesNotMatch(content, /fetch\(/);
});
