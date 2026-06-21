import { DEADLOCK_ITEMS } from '../data/deadlockItems.generated.js';
import {
  GAMEBANANA_MOD_SOURCE,
  GAMEBANANA_PRESET_SOURCES,
  REQUIRED_GAMEBANANA_TEMPLATE_SOURCE
} from '../data/gamebananaSources.generated.js';

export const PRESET_TEMPLATE_IDS = Object.freeze({
  PASSIVE_AND_ACTIVE: 'passive-and-active',
  PASSIVE_AND_ACTIVE_NO_BEHAVIOR: 'passive-and-active-no-behavior',
  PASSIVE_ONLY: 'passive-only'
});

const ALL_ITEM_IDS = Object.freeze(DEADLOCK_ITEMS.map((item) => item.id).sort());



export const REQUIRED_GAMEBANANA_TEMPLATE = Object.freeze({
  fileName: REQUIRED_GAMEBANANA_TEMPLATE_SOURCE.fileName,
  modUrl: GAMEBANANA_MOD_SOURCE.url,
  sha256: REQUIRED_GAMEBANANA_TEMPLATE_SOURCE.sha256,
  md5: REQUIRED_GAMEBANANA_TEMPLATE_SOURCE.md5,
  archiveMember: REQUIRED_GAMEBANANA_TEMPLATE_SOURCE.archiveMember
});

function sourceArchive(source) {
  return Object.freeze({
    fileName: source.fileName,
    sha256: source.sha256,
    md5: source.md5,
    archiveMember: source.archiveMember,
    downloadUrl: source.downloadUrl,
    fileId: source.fileId,
    size: source.size
  });
}

function presetTemplate(source, description) {
  return Object.freeze({
    id: source.id,
    label: source.label,
    description,
    outputFileName: source.outputFileName,
    archiveOutputFileName: source.archiveOutputFileName,
    templatePath: source.templatePath,
    templateSha256: source.templateSha256,
    sourceArchive: sourceArchive(source),
    presetItemIds: source.presetItemIds,
    supportedItemIds: ALL_ITEM_IDS
  });
}

export const PRESET_TEMPLATES = Object.freeze([
  presetTemplate(
    GAMEBANANA_PRESET_SOURCES.passiveOnly,
    'Preselects the passive-only filter while keeping every shop item available.'
  ),
  presetTemplate(
    GAMEBANANA_PRESET_SOURCES.passiveAndActive,
    'Preselects the passive-and-active filter with active behavior enabled while keeping every shop item available.'
  ),
  presetTemplate(
    GAMEBANANA_PRESET_SOURCES.passiveAndActiveNoBehavior,
    'Preselects the passive-and-active filter without active behavior edits while keeping every shop item available.'
  )
]);

export function getPresetTemplate(id) {
  const preset = PRESET_TEMPLATES.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown preset template: ${id}`);
  return preset;
}
