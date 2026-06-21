# Repository Guidelines

## Project Overview

`custom-passive` is a static Astro + Preact app for Deadlock passive-item modding. Users verify the required GameBanana template archive, choose a preset, select shop items, and download a browser-built `.7z` containing a VPK with patched `scripts/abilities.vdata_c`. Archive processing stays local in the browser; there is no server runtime.

The app deploys to GitHub Pages under `/custom-passive/`. Keep runtime asset, template, WASM, and Playwright URLs base-path safe.

## Architecture & Data Flow

- `src/pages/index.astro` imports `src/styles/global.css` and hydrates `src/components/CustomPassiveShop.jsx` with `client:load`.
- `CustomPassiveShop.jsx` owns UI state: selected item IDs, active tab/search, preset mode, template gate, status strings, and predictive hover.
- Generated item data comes from `src/data/deadlockItems.generated.js`:
  - `DEADLOCK_ITEMS` drives catalog rendering, search, tabs, icons, costs, and activation badges.
  - `PASSIVE_FLAG_TYPE_OFFSETS` maps item IDs to Binary KV3 passive-flag offsets.
  - `TIER_COSTS` drives tier labels and catalog validation.
- GameBanana metadata is generated in `src/data/gamebananaSources.generated.js` and adapted by `src/lib/presetTemplates.js` into `REQUIRED_GAMEBANANA_TEMPLATE`, `PRESET_TEMPLATE_IDS`, `PRESET_TEMPLATES`, and `getPresetTemplate()`.
- Startup template gate:
  - User uploads/links `templete_06_19.7z`.
  - Browser verifies SHA-256 against `REQUIRED_GAMEBANANA_TEMPLATE.sha256`.
  - Successful verification is cached for 12 hours under `custom-passive:template-verification:v1`.
- Build flow:
  1. Selected preset identifies a public binary template in `public/templates/gamebanana/**/scripts/abilities.vdata_c.template`.
  2. `loadTemplateBytes()` fetches `${import.meta.env.BASE_URL}${templatePath}` and verifies template SHA-256.
  3. `source2PassiveFlags.js` scans current Source 2/Binary KV3 bytes and `assertCompletePassiveFlagOffsets()` rejects incomplete templates.
  4. `passiveFlagTemplate.js` copies template bytes, resets all known flags false, then sets selected IDs true.
  5. `source2ResourceCompression.js` zstd-compresses Binary KV3 buffers and updates Source 2 compressed-size fields.
  6. `vpkWriter.js` writes a browser-safe VPK v2 with `scripts/abilities.vdata_c`.
  7. `archiveWriter.js` wraps the VPK in a `.7z` via `7z-wasm`; `download.js` triggers the download.
- Presets only change selected IDs and output template; all shop items remain available.

## Key Directories

- `src/pages/` — Astro page entrypoints. Current shell: `index.astro`.
- `src/components/` — Preact UI. `CustomPassiveShop.jsx` owns app state, template gate, tabs, selection, predictive hover, build/download actions, and stable E2E selectors.
- `src/lib/` — browser-safe binary/package primitives: Source 2 parsing, passive flag patching, zstd compression, VPK read/write, 7z extract/write, filename sanitizing, and download helper.
- `src/data/` — generated item catalog, passive offsets, tier costs, and GameBanana metadata. Do not hand-edit generated files.
- `src/styles/` — global CSS for the build panel, modal gate, catalog boards, item cards, hover animation, responsive layout, and reduced-motion rules.
- `scripts/` — local generation and GameBanana sync pipelines.
- `public/templates/` — generated preset Binary KV3 templates fetched by the browser at build time.
- `public/assets/deadlock/` — generated/pruned Deadlock WebP shop and item assets.
- `test/` — Node `node:test` unit/integration tests and binary fixtures.
- `e2e/` — Playwright browser tests.
- `.github/workflows/` — GitHub Pages deployment workflow.

## Development Commands

Use npm; `package-lock.json` is lockfile version 3.

```bash
npm install
npm run dev                         # Astro dev server
npm run dev -- --host 127.0.0.1     # Dev server used by Playwright
npm run build                       # Static Astro build to dist/
npm run preview                     # Preview built output
npm test                            # Node unit/integration tests
npm run test:e2e                    # Playwright E2E tests
npm run check                       # generate:data + generate:presets + tests + build + E2E
```

Generation and sync commands:

```bash
npm run generate:data               # Regenerate catalog, offsets, default test fixture, WebP assets
npm run generate:presets            # Regenerate public GameBanana preset templates
npm run sync:gamebanana             # Sync GameBanana metadata/templates from API
```

No lint script is currently declared.

## Code Conventions & Common Patterns

- ESM only: `package.json` sets `type: module`; scripts/configs use `.mjs`.
- Preact hooks come from `preact/hooks`. Keep hooks at component/custom-hook top level.
- Store selected IDs as immutable `Set` updates; persist sorted arrays under `custom-passive:selected-items:v2`.
- Guard browser-only APIs during static evaluation: `typeof window === 'undefined'`, `typeof document === 'undefined'`, optional `import.meta.env` access.
- Prefix public runtime paths with `import.meta.env.BASE_URL`. Never hard-code root `/` for app assets/templates because deployment base is `/custom-passive/`.
- Keep generated metadata frozen with `Object.freeze`; update generators instead of generated data by hand.
- Surface user-facing failures through status text and clear `Error` messages at binary, fetch, archive, template, and validation boundaries.
- Binary code uses `Uint8Array` and `DataView` with little-endian reads/writes. Patch copies; do not mutate source template bytes.
- Browser build path must stay browser-safe. Do not import native compiler/tool scripts into browser-reachable files.
- Heavy browser build modules are loaded lazily (`vpkWriter.js`, `archiveWriter.js`, `7z-wasm`); zstd/xxhash init is promise-cached.
- Stable selectors used by E2E include `template-gate`, `template-gate-preset`, `template-gate-file`, `preset-template-select`, `selected-count`, `build-download`, `tab-*`, `search-input`, and `item-card-${item.id}`.
- CSS class names are behavior-coupled: `is-predicted-hover`, `is-item-hovered`, `is-hover-related`, `item-hover-frame`, `catalog-board`, and `catalog-list-board` are tested/styled contracts.

## Important Files

- `package.json` — npm scripts and dependencies.
- `astro.config.mjs` — GitHub Pages `site`, `/custom-passive/` base, Preact integration, and Vite alias for `module` to `src/lib/nodeModuleShim.js`.
- `playwright.config.mjs` — E2E base URL and dev-server command.
- `.github/workflows/deploy.yml` — Pages CI: `npm ci`, `npm run sync:gamebanana`, `npm test`, `npm run build`, upload `dist/`, deploy.
- `src/pages/index.astro` — app HTML shell.
- `src/components/CustomPassiveShop.jsx` — main UI and browser build orchestration.
- `src/styles/global.css` — global layout, Deadlock styling, card proportions, hover states, breakpoints.
- `src/data/deadlockItems.generated.js` — generated catalog and passive offsets.
- `src/data/gamebananaSources.generated.js` — generated GameBanana source metadata, checksums, preset selected IDs, and template paths.
- `src/lib/presetTemplates.js` — runtime preset/template metadata adapter.
- `src/lib/packageBuilder.js` — template loading/SHA verification and package payload assembly.
- `src/lib/passiveFlagTemplate.js` — byte-level passive flag patcher/reader.
- `src/lib/source2BinaryKv3.js` — Source 2 resource and Binary KV3 parsing/rebuild helpers.
- `src/lib/source2PassiveFlags.js` — Source 2/Binary KV3 passive-flag offset scanner.
- `src/lib/source2ResourceCompression.js` — zstd Binary KV3 compressor and Source 2 size-field updater.
- `src/lib/vpkWriter.js` / `src/lib/vpkReader.js` — browser-safe VPK v2 writer/reader.
- `src/lib/archiveWriter.js` / `src/lib/archiveExtractor.js` / `src/lib/sevenZipWasm.js` — `7z-wasm` wrappers; depend on `public/7zz.wasm`.
- `scripts/generate-custom-passive-data.mjs` — authoritative catalog/default-template/asset generator.
- `scripts/generate-preset-templates.mjs` — preset template generator and archive selection verifier.
- `scripts/sync-gamebanana-mod.mjs` — GameBanana API sync and static metadata/template updater.
- `test/fixtures/templates/custom_passive/scripts/abilities.vdata_c.template` — generated default Binary KV3 fixture for tests.
- `public/templates/gamebanana/*/scripts/abilities.vdata_c.template` — generated preset templates fetched by the app.
- `e2e/custom-passive.spec.js` — browser/download/layout/hover/template coverage.

## Runtime/Tooling Preferences

- Use Node and npm, not Bun. README states Node 22.12+ for local development; CI uses Node 22.
- The app is static after build. Do not add server-only runtime dependencies for build/download behavior.
- Keep `public/7zz.wasm` and `public/zstd.wasm` served from the Astro base root.
- `generate:data` and `generate:presets` assume Windows/local Deadlock tooling paths, including:
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/abilities.vdata`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/abilities2.vdata`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/sr2compiler/New folder.exe`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/passive.py`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/active.py`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/active_no_behavior.py`
  - `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/pak01_dir.vpk`
  - `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/*.7z`
  - `F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/.tmp/source2viewer-cli/Source2Viewer-CLI.exe`
  - `ffmpeg` on `PATH` for WebP optimization
- `generate:data` deletes and repopulates `public/assets/deadlock/`; review generated diffs carefully.
- GameBanana compatibility is decided by generated MD5/SHA-256 metadata, not filenames alone.
- `sync:gamebanana` refuses downgrades unless `-- --allow-downgrade`; it can keep the current template with `-- --allow-missing-template` only when intentional.

## Testing & QA

- Unit/integration tests use Node's built-in `node:test` and `node:assert/strict`.
- E2E tests use `@playwright/test`; base URL is `http://127.0.0.1:4321/custom-passive/`.
- Playwright starts `npm run dev -- --host 127.0.0.1`, reuses an existing server outside CI, and expects the local upload fixture at `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/templete_06_19.7z`.
- Prefer tests using real generated data, real template bytes, real VPK round trips, and real browser downloads. Do not replace these paths with mocks.
- For UI or browser build changes, run at least:

```bash
npm test
npm run build
npm run test:e2e
```

- For generator/template/catalog changes, run the full local pipeline when required Deadlock/tool paths exist:

```bash
npm run check
```

- Existing coverage includes catalog shape, passive byte patching, preset metadata and SHA checks, Source 2 offset scanning, package building, VPK round trip, archive import/export, browser path safety, CSS regressions, template gate TTL, downloads, search/tabs, hover prediction/dimming, layout, badges, card proportions, and debug-control absence.
