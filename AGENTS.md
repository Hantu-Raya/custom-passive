# Custom Passive Builder

## Scope

`custom-passive` is a static Astro + Preact app (<https://hantu-raya.github.io/custom-passive/>) for the GameBanana mod "Always Show Passive Items and Actives Icons" (mod 601444). Users verify the required GameBanana template archive, choose a preset, select shop items, and download a browser-built `.7z` containing one VPK with a patched `scripts/abilities.vdata_c`. Archive processing stays in the browser; there is no server runtime. Keep it that way: no server-only dependencies for build or download behavior.

The app deploys to GitHub Pages under `/custom-passive/`. Every runtime asset, template, WASM and Playwright URL must stay base-path safe.

Upstream ownership: the four GameBanana archives come from `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/build_abilities_paks.ps1` (see that repo's `abilities/AGENTS.md`). This repo's generators compile from that repo's VData baselines and transform scripts, so a transform change there makes the generated templates disagree with the published archives until they are rebuilt, uploaded and synced here.

| Preset id | GameBanana archive | VPK member | Source transform |
|-----------|--------------------|------------|------------------|
| required template | `templete_MM_DD.7z` (spelling intentional) | `pak02_dir.vpk` | none |
| `passive-only` | `filter_for_passive_items_MM_DD.7z` | `pak04_dir.vpk` | `passive.py` on `abilities2.vdata` |
| `passive-and-active` | `filter_for_passive_and_active_items_yesbehaviour_MM_DD.7z` | `pak03_dir.vpk` | `active.py` |
| `passive-and-active-no-behavior` | `filter_for_passive_and_active_items_MM_DD.7z` | `pak05_dir.vpk` | `active_no_behavior.py` |

Presets only change the selected IDs and output template; every shop item stays available.

## Source ownership

```text
src/pages/index.astro (imports src/styles/global.css)
  -> src/components/CustomPassiveShop.jsx (client:load)
       -> src/data/deadlockItems.generated.js
       -> src/lib/presetTemplates.js <- src/data/gamebananaSources.generated.js
       -> src/lib/packageBuilder.js
            -> source2PassiveFlags.js -> passiveFlagTemplate.js
            -> source2ResourceCompression.js -> vpkWriter.js -> archiveWriter.js -> download.js
```

- `CustomPassiveShop.jsx` owns UI state: selected item IDs, active tab/search/filters, preset mode, template gate, status strings, predictive hover, and build/download actions.
- `deadlockItems.generated.js` provides `DEADLOCK_ITEMS` (catalog, search, tabs, icons, costs, activation badges), `PASSIVE_FLAG_TYPE_OFFSETS` (item ID → Binary KV3 passive-flag offset), and `TIER_COSTS`.
- `shopFilters.generated.js` provides deeply frozen `SHOP_FILTER_TREE` and `SHOP_FILTER_UI`, extracted from stock Panorama layouts/styles and English localization with oracle-verified memberships. `shopFilterSelection.js` shares the order-preserving group expansion, OR filtering and search predicate between UI and tests.
- `presetTemplates.js` adapts generated GameBanana metadata into `REQUIRED_GAMEBANANA_TEMPLATE` (including `downloadPageUrl`, `https://gamebanana.com/mods/download/601444#FileInfo_<fileId>`), `PRESET_TEMPLATE_IDS`, `PRESET_TEMPLATES` and `getPresetTemplate()`.
- `packageBuilder.js` loads templates and verifies their SHA-256, then assembles the package payload.
- `source2BinaryKv3.js` parses and rebuilds Source 2 resources; `source2PassiveFlags.js` scans passive-flag offsets; `passiveFlagTemplate.js` patches and reads flag bytes.
- `vpkWriter.js`/`vpkReader.js` write and read browser-safe VPK v2. `archiveWriter.js`/`archiveExtractor.js`/`sevenZipWasm.js` wrap `7z-wasm` and depend on `public/7zz.wasm`.
- `scripts/generate-custom-passive-data.mjs` is the authoritative catalog, default test template and WebP asset generator. `scripts/generate-preset-templates.mjs` generates the preset templates and verifies archive selections. `scripts/sync-gamebanana-mod.mjs` syncs GameBanana metadata. `scripts/inject-stock-external-refs.mjs` restores the stock RERL block after each compile.

## Template gate and build flow

- Startup gate: the user uploads or links the required template (currently `templete_10_07.7z`). The browser checks its SHA-256 against `REQUIRED_GAMEBANANA_TEMPLATE.sha256` and caches success for 12 hours under `custom-passive:template-verification:v1`. The gate and build-panel links open `downloadPageUrl`, not the mod page.
- Build: the selected preset names a public binary template in `public/templates/gamebanana/**/scripts/abilities.vdata_c.template`.
  1. `loadTemplateBytes()` fetches `${import.meta.env.BASE_URL}${templatePath}` and verifies its SHA-256. Preset templates download only when the user clicks Build.
  2. `source2PassiveFlags.js` scans the Binary KV3 bytes; `assertCompletePassiveFlagOffsets()` rejects incomplete templates.
  3. `passiveFlagTemplate.js` copies the bytes, resets every known flag to false, then sets the selected IDs true.
  4. `source2ResourceCompression.js` zstd-compresses Binary KV3 buffers and updates the Source 2 compressed-size fields.
  5. `vpkWriter.js` writes a VPK v2 with `scripts/abilities.vdata_c`; `archiveWriter.js` wraps it in a `.7z`; `download.js` triggers the download.

## Runtime rules

- ESM only (`type: module`; scripts and configs use `.mjs`). Use Node and npm, not Bun; Node 22.12+ locally, Node 22 in CI.
- Preact hooks come from `preact/hooks` and stay at component/custom-hook top level.
- Store selected IDs as immutable `Set` updates; persist sorted arrays under `custom-passive:selected-items:v2`.
- Guard browser-only APIs during static evaluation (`typeof window`/`typeof document`, optional `import.meta.env`).
- Prefix runtime paths with `import.meta.env.BASE_URL`; never hard-code `/`. Keep `public/7zz.wasm` and `public/zstd.wasm` at the base root.
- Binary code uses `Uint8Array`/`DataView` little-endian reads and writes, patches copies, and never mutates source template bytes.
- Browser-reachable files must not import native compiler or tool scripts. Load heavy modules lazily (`vpkWriter.js`, `archiveWriter.js`, `7z-wasm`); zstd/xxhash init is promise-cached.
- Surface user-facing failures through status text and clear `Error` messages at binary, fetch, archive, template and validation boundaries.
- Popular is the only runtime feature that contacts `api.deadlock-api.com`: lazily load heroes and normal-mode item stats while the tab is open, with an explicit hourly-rounded 30-day window. Validate responses, session-cache successful raw rows for 10 minutes, share pending keys, abort after 8 seconds and ignore stale hero results. No guessed fallback or automatic 429 retry. Build/download remain browser-only and independent of the API.
- Stable E2E selectors: `template-gate`, `template-gate-preset`, `template-gate-file`, `template-gate-link`, `gamebanana-template-link`, `preset-template-select`, `selected-count`, `build-download`, `tab-selected`, `tab-popular`, `tab-all`, `tab-weapon`, `tab-spirit`, `tab-vitality`, `popular-hero-select`, `search-input`, `clear-search`, `filter-category-<slug>` (physical, spirit, defense, mobility, disruption, misc), `filter-option-<slugified-filter-id>`, `active-filters`, `active-filter-<slugified-filter-id>`, `clear-filters`, `item-card-${item.id}`. Filter-id slugs are lowercase with non-alphanumeric runs replaced by `-` (for example, `Physical/Ammo` → `physical-ammo`).
- Behavior-coupled CSS classes: `is-predicted-hover`, `is-item-hovered`, `is-hover-related`, `item-hover-frame`, `catalog-board`, `catalog-list-board`.
- GameBanana compatibility is decided by generated MD5/SHA-256 metadata, never filenames.

## Supporter leaderboard

- Treat the user-provided Ko-fi supporters CSV as authoritative for each update and include every row. Show blank, `Anonymous` and equivalent names as `Ko-fi Supporter`.
- Sort by descending `Total`; equal totals share a competition rank and keep CSV order.
- Publish only rank, display name and total USD. Keep every other CSV field out of source, tests, build output and browser output.
- Update the exact E2E leaderboard expectations, verify the built footer, and confirm the deployed Pages result.

## Source and generated files

Edit `src/components/`, `src/lib/`, `src/pages/`, `src/styles/`, `scripts/`, `test/` and `e2e/`. Never hand-edit `src/data/*.generated.js`, `public/templates/`, `public/assets/deadlock/` or `test/fixtures/templates/`; change the generators instead. Generated metadata stays `Object.freeze`d. `generate:data` deletes and repopulates `public/assets/deadlock/`, so review its diff.

Never copy a GameBanana filter or template VData into `public/templates/`: newer archives can omit passive-flag fields, so templates are always rebuilt from the current local sources.

The nested `custom-passive/` directory is a gitignored stale copy; do not edit or grep it as source.

Generators assume these local paths:

- `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/abilities.vdata`, `abilities2.vdata`, `passive.py`, `active.py`, `active_no_behavior.py`, `inject_stock_external_refs.py`
- `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/sr2compiler/New folder.exe`
- `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/.tmp/source2viewer-cli/Source2Viewer-CLI.exe`
- `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/pak01_dir.vpk`
- the four current GameBanana archives in `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/` under their GameBanana filenames
- `ffmpeg` on `PATH` for WebP optimization

## Verification

```bash
npm test          # node:test unit/integration
npm run build
npm run test:e2e  # Playwright, http://127.0.0.1:4321/custom-passive/
npm run check     # generate:data + generate:presets + test + build + test:e2e
```

UI or browser-build changes need at least `npm test`, `npm run build` and `npm run test:e2e`. Generator, template or catalog changes need `npm run check`. Playwright starts `npm run dev -- --host 127.0.0.1`, reuses an existing server outside CI, and uploads `addons/${REQUIRED_GAMEBANANA_TEMPLATE.fileName}`, so that archive must be present.

Prefer real generated data, real template bytes, real VPK round trips and real browser downloads; do not replace them with mocks. Tests use `node:test` with `node:assert/strict` and `@playwright/test`.

### Release checklist (new GameBanana batch)

- **Sync first.** `npm run sync:gamebanana` verifies archive MD5s, computes SHA-256 locally and writes metadata. It refuses downgrades unless `-- --allow-downgrade`, and keeps the current template with `-- --allow-missing-template` only when intended.
- **Put all four archives in `addons/`** under their GameBanana names and check their MD5s against `gamebananaSources.generated.js` (download with `https://gamebanana.com/dl/<fileId>`).
- **Mods repo must match the upload.** `generate:presets` verifies the selections against the GameBanana archives using the mods repo's current scripts. If that fails, the local transforms have moved past the published batch: rebuild and upload first, or use `-- --template-archive <path> --skip-source-archive-verification` only when deliberately shipping ahead of the archives.
- **Run `npm run check`** and commit the generated metadata, templates, fixture and assets together. Running the generators twice should produce no diff.
- **Deploy manually.** Pages deployment is `workflow_dispatch` only (`gh workflow run deploy.yml -R Hantu-Raya/custom-passive`); pushing does not publish. CI syncs with `-- --allow-stale-metadata`, which keeps the last verified data if GameBanana is unreachable; never use it for a manual update.
