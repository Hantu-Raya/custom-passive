# Deadlock Custom Passive Builder

Static Astro + Preact app for building local Deadlock passive-item filter archives. The app runs in the browser: users link the required GameBanana template archive, choose a preset, edit selected shop items, and download a compressed `.7z` containing the patched VPK.

Hosted app: <https://hantu-raya.github.io/custom-passive/>

## What it does

- Requires the verified GameBanana template archive identified by generated metadata.
- Caches template verification locally for 12 hours.
- Supports Passive Only, Passive + Actives, and Passive + Actives (No Behavior) presets from the generated GameBanana source metadata.
- Defers preset template download until the user clicks Build.
- Lets users add or remove any shop item from the selected passive list.
- Patches `m_bShowInPassiveItemsArea` inside compiled `abilities.vdata_c` bytes.
- Compresses Binary KV3 with zstd and writes Source 2 compressed-size fields consistently for Deadlock compatibility.
- Writes a browser-generated `.7z` archive containing one VPK with `scripts/abilities.vdata_c`.
- Serves generated shop and item art as pruned WebP assets for lower bandwidth.
- Keeps archive processing local. There is no server-side upload or build step.

## Supported inputs

Required template and preset sources are generated from the latest compatible GameBanana batch. Use the template filename shown in the app, not a previously documented filename.

Filenames are only hints. SHA-256 metadata in `src/data/gamebananaSources.generated.js` decides compatibility.

## Development

Requires Node 22.12 or newer.

```bash
npm install
npm run dev
npm test
npm run build
npm run test:e2e
```

Local dev URL with the configured GitHub Pages base:

```text
http://localhost:4321/custom-passive/
```

## Generation

Regenerate the catalog, offsets, default template, and extracted Deadlock assets:

```bash
npm run generate:data
```

This also prunes unused extracted shop art, converts runtime assets to WebP with `ffmpeg`, and writes the default template fixture under `test/fixtures/`.

## Updating GameBanana templates

Sync GameBanana metadata before generating templates:

```bash
npm run sync:gamebanana
```

The sync script cache-busts GameBanana API requests, retries transient API and archive failures, verifies archive MD5 values, computes SHA-256 locally, extracts preset VPKs, and writes static metadata. It refuses to downgrade from the current generated batch unless you pass `-- --allow-downgrade`.

Then rebuild the browser templates from the current local Deadlock sources:

```bash
npm run generate:presets
```

`generate:presets` writes all three `public/templates/gamebanana/**/abilities.vdata_c.template` files and refreshes their SHA-256 values in `src/data/gamebananaSources.generated.js`. Commit those files together.

If the matching GameBanana archives are not installed under the configured `G:/SteamLibrary/.../addons/` path, point the generator at the verified template archive and bypass only source-archive selection verification:

```bash
npm run generate:presets -- \
  --template-archive "G:/templete_MM_DD.7z" \
  --skip-source-archive-verification
```

The supplied archive must match the SHA-256 in generated metadata. This mode still compiles the local current Deadlock sources and creates a complete browser template.

Never copy a GameBanana filter or template VData directly into `public/templates/`. A newly published archive can omit passive-flag fields for catalog items. The browser would then either fail to patch selections or fall back to an older complete template. Rebuild from current local sources so every catalog item has a writable flag, then run the validation below.

GitHub Pages uses `-- --allow-stale-metadata` only when GameBanana's API or an archive download remains unavailable after retries. It deploys the last verified metadata and templates without changing either; the next hourly run retries the live sync. Do not use this mode for a manual update that must capture the latest batch.

After a template rebuild, run:

```bash
npm test
npm run build
```

The template tests verify each public template's SHA-256, complete catalog coverage, and patched selections.

## Verification

Run the standard local gate:

```bash
npm run check
```

For UI-only changes, usually run:

```bash
npm test
npm run build
npm run test:e2e
```

Playwright uses `http://127.0.0.1:4321/custom-passive/` and expects the local template archive at the configured `G:/SteamLibrary/.../addons/` path. Keep that fixture aligned with the current generated metadata.

## Deployment

Astro is configured with:

- `site: "https://hantu-raya.github.io"`
- `base: "/custom-passive/"`

Build output is written to `dist/`.

GitHub Pages deploys from `.github/workflows/deploy.yml`. The workflow runs hourly and on pushes to `main`. Each run retries cache-busted GameBanana API requests and archive downloads, syncs fresh metadata when possible, then runs tests and builds. If either external step remains unavailable, it deploys the last verified metadata and templates and retries the live sync on the next hourly run.

## License

Apache-2.0. See `LICENSE`.

This is an unofficial fan-made tool. It is not affiliated with Valve.
