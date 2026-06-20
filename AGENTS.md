# Repository Guidelines

## Project Overview

`custom-passive` is a static Astro + Preact app for Deadlock custom passive-item modding. Users select shop items, the browser flips each selected item's `m_bShowInPassiveItemsArea` flag inside a compiled `abilities.vdata_c` template, writes a VPK, wraps it in a `.7z`, and downloads it without a server.

The app is deployed under `/custom-passive/`. Keep all runtime asset, template, and Playwright URLs base-path safe.

## Architecture & Data Flow

- Entry point: `src/pages/index.astro` imports `src/styles/global.css` and hydrates `src/components/CustomPassiveShop.jsx` with `client:load`.
- Generated catalog: `src/data/deadlockItems.generated.js` exports `DEADLOCK_ITEMS`, `PASSIVE_FLAG_TYPE_OFFSETS`, and `TIER_COSTS`.
- Template gate:
  - Startup requires upload/link of `templete_06_19.7z` from GameBanana.
  - Required archive metadata lives in `src/lib/presetTemplates.js` as `REQUIRED_GAMEBANANA_TEMPLATE`.
  - Verified template SHA is cached in `localStorage` for 12 hours under `custom-passive:template-verification:v1`.
- Presets:
  - `Passive Only` downloads `filter_for_passive_items_06_19.7z` containing `pak04_dir.vpk` and preselects IDs from that archive.
  - `Passive + Actives` downloads `filter_for_passive_and_active_items_yesBehaviour_06_19.7z` containing `pak03_dir.vpk` and preselects IDs from that archive.
  - `Passive + Actives (No Behavior)` downloads `filter_for_passive_and_active_items_06_19.7z` containing `pak05_dir.vpk` and preselects IDs from that archive.
  - All modes keep all shop items available; presets only change selected IDs and output template.
- Browser build flow:
  1. `CustomPassiveShop.jsx` verifies the required GameBanana template gate, then lazy-loads the selected preset template only when building.
  2. `source2PassiveFlags.js` scans Source 2/Binary KV3 bytes for every passive flag offset.
  3. `packageBuilder.js` calls `buildPassiveVdataBytes()` to copy template bytes, reset known flags false, and set selected IDs true.
  4. `source2ResourceCompression.js` zstd-compresses Binary KV3 buffers and updates the Source 2 compressed-size fields.
  5. `vpkWriter.js` writes one embedded VPK file, `archiveWriter.js` wraps it in the selected `.7z`, and `download.js` downloads it.
- Generation flow:
  - `scripts/generate-custom-passive-data.mjs` regenerates the catalog, default test fixture, and pruned WebP assets in `public/assets/deadlock/`.
  - `scripts/generate-preset-templates.mjs` verifies GameBanana archives by SHA-256, runs passive/active transforms, compiles, normalizes Binary KV3 DATA, verifies preset selected IDs, and writes preset templates.

## Key Directories

- `src/pages/` — Astro page entrypoints. Current app shell is `index.astro`.
- `src/components/` — Preact UI. `CustomPassiveShop.jsx` owns app state, template gate, tabs, predictive hover, presets, and build/download actions.
- `src/lib/` — browser-safe binary/package primitives: template patching, Source 2 flag scanning/compression, VPK read/write, archive extraction/writing, CRC32, download helper, preset metadata.
- `src/data/` — generated catalog and offsets. Do not hand-edit generated data; update generators instead.
- `src/styles/` — global CSS for build panel, template gate, catalog boards, item cards, hover animation, responsive layout.
- `scripts/` — local Deadlock/GameBanana generation pipeline.
- `public/templates/` — generated preset binary templates fetched by the browser at build time.
- `public/assets/deadlock/` — generated/pruned Deadlock shop and item WebP assets.
- `test/` — Node built-in unit/integration tests.
- `e2e/` — Playwright browser tests.

## Development Commands

Use npm. The lockfile is `package-lock.json` lockfile version 3.

```bash
npm install
npm run dev                         # Astro dev server
npm run dev -- --host 127.0.0.1     # Host used by Playwright
npm run build                       # Static Astro build to dist/
npm run preview                     # Preview built output
npm run generate:data               # Regenerate catalog, default template, assets
npm run generate:presets            # Regenerate GameBanana preset templates
npm run sync:gamebanana             # Sync latest GameBanana archive metadata/templates
npm test                            # Node unit/integration tests
npm run test:e2e                    # Playwright E2E tests
npm run check                       # generate:data + generate:presets + tests + build + E2E
```

No lint script is currently declared.

## Code Conventions & Common Patterns

- ESM only: `package.json` sets `type: module`; configs use `.mjs`; tests and scripts use native ESM imports.
- Use Preact hooks from `preact/hooks`. Keep hooks at component/custom-hook top level.
- Keep selection state as immutable `Set` updates. Persist selected IDs as sorted JSON arrays under `custom-passive:selected-items:v2`.
- Keep preset and required-archive metadata generated in `src/data/gamebananaSources.generated.js`; `src/lib/presetTemplates.js` adapts it for runtime UI. Use `Object.freeze` for exported metadata and constants.
- Prefix public runtime fetches/assets with `import.meta.env.BASE_URL`; never hard-code root `/` because the app base is `/custom-passive/`.
- Guard browser-only APIs when static rendering can evaluate code (`typeof window === 'undefined'`).
- Surface user-facing failures through the build/template status string; use clear `Error` messages at binary, fetch, archive, and template validation boundaries.
- Binary code uses `Uint8Array` and `DataView` with little-endian reads/writes. Avoid mutating source template bytes; patch copies.
- Preserve browser-only build path safety. Do not import native compiler/tool scripts into browser-reachable files.
- Keep stable E2E selectors when changing UI: `template-gate`, `template-gate-file`, `preset-template-select`, `selected-count`, `build-download`, `tab-*`, `search-input`, and `item-card-${item.id}`.
- CSS class names are behavior-coupled: `is-predicted-hover`, `is-item-hovered`, `is-hover-related`, `item-hover-frame`, `catalog-board`, and `catalog-list-board` are used by tests and styling.

## Important Files

- `package.json` — npm scripts and dependency manifest.
- `astro.config.mjs` — Astro site, `/custom-passive/` base, Preact integration.
- `playwright.config.mjs` — E2E base URL and dev-server command.
- `src/pages/index.astro` — app page entry.
- `src/components/CustomPassiveShop.jsx` — main UI, state, template gate, selection, predictive hover, build/download flow.
- `src/styles/global.css` — global layout, shop-board, cards, template modal, hover animation, responsive rules.
- `src/data/deadlockItems.generated.js` — generated catalog, passive offsets, tier costs.
- `src/data/gamebananaSources.generated.js` — generated static GameBanana source metadata, checksums, preset selected IDs, and template paths.
- `src/lib/presetTemplates.js` — required GameBanana archive, preset templates, source archive metadata, selected preset IDs.
- `src/lib/packageBuilder.js` — template loading/SHA verification and VPK file payload assembly.
- `src/lib/passiveFlagTemplate.js` — byte-level passive flag patcher/reader.
- `src/lib/source2BinaryKv3.js` — shared Source 2 resource and Binary KV3 block parsing/rebuild helpers.
- `src/lib/source2PassiveFlags.js` — Source 2/Binary KV3 scanner for offsets and selected IDs.
- `src/lib/source2ResourceCompression.js` — zstd Binary KV3 compressor; keeps compressed-size metadata consistent for Deadlock compatibility.
- `src/lib/vpkWriter.js` / `src/lib/vpkReader.js` — minimal VPK v2 writer/reader.
- `src/lib/archiveExtractor.js` / `src/lib/archiveWriter.js` / `src/lib/sevenZipWasm.js` — `7z-wasm` wrappers; depend on `public/7zz.wasm`.
- `scripts/generate-custom-passive-data.mjs` — authoritative catalog/default-template/asset generator.
- `scripts/generate-preset-templates.mjs` — preset template generator and archive selection verifier.
- `scripts/sync-gamebanana-mod.mjs` — GameBanana API sync; downloads archives, verifies MD5/SHA-256, extracts preset templates, and updates generated metadata.
- `test/fixtures/templates/custom_passive/scripts/abilities.vdata_c.template` — generated default template fixture for unit tests.
- `public/templates/gamebanana/passive-only/scripts/abilities.vdata_c.template` — generated passive-only preset template.
- `public/templates/gamebanana/passive-and-active/scripts/abilities.vdata_c.template` — generated passive+active preset template.
- `e2e/custom-passive.spec.js` — browser/download/layout/hover/template coverage.

## Runtime/Tooling Preferences

- Use Node and npm, not Bun. Astro 6.4.x requires Node `>=22.12.0`; npm lockfile packages require npm `>=9.6.5`.
- The app is static after build. Do not add server-only runtime dependencies for build/download behavior.
- `public/7zz.wasm` must remain served at the Astro base root; archive extraction expects `${BASE_URL}7zz.wasm`.
- `npm run generate:data` and `npm run generate:presets` are Windows/local-game-install specific. They reference paths such as:
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/abilities.vdata`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/sr2compiler/New folder.exe`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/passive.py`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/active.py`
  - `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/pak01_dir.vpk`
  - `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/*.7z`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/.tmp/source2viewer-cli/Source2Viewer-CLI.exe`
  - `ffmpeg` on `PATH` for WebP asset optimization
- `generate:data` deletes and repopulates `public/assets/deadlock/` with only runtime-referenced WebP assets; review generated diffs carefully.
- `.github/workflows/deploy.yml` runs `npm run sync:gamebanana` before tests/build on pushes and every 6 hours. If a new GameBanana batch lacks a full patchable template for every shop item, sync fails instead of deploying stale abilities.
- Updating templates requires updating SHA-256 metadata and tests in the same change.

## Testing & QA

- Unit/integration tests use Node's built-in `node:test` and `node:assert/strict`.
- E2E tests use `@playwright/test`; base URL is `http://127.0.0.1:4321/custom-passive/`.
- Playwright auto-starts `npm run dev -- --host 127.0.0.1` and reuses an existing server outside CI.
- E2E template upload currently expects `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/templete_06_19.7z`.
- Prefer tests using real generated data, real template bytes, real VPK round trips, and real browser downloads. Do not replace these paths with mocks.
- For UI or browser build changes, run at least:

```bash
npm test
npm run build
npm run test:e2e
```

- For generator/template/catalog changes, run the full local pipeline when the required Deadlock/tool paths exist:

```bash
npm run check
```

- Existing coverage includes catalog shape, passive byte patching, preset metadata and SHA checks, Source 2 offset scanning, package building, VPK round trip, archive import, browser path safety, CSS regressions, template gate TTL, downloads, search/tabs, hover prediction/dimming, layout, badges, card proportions, and debug-control absence.
