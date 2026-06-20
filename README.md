# Deadlock Custom Passive Builder

Static Astro + Preact app for building local Deadlock passive-item filter archives. The app runs in the browser: users link the required GameBanana template archive, choose a preset, edit selected shop items, and download a compressed `.7z` containing the patched VPK.

Hosted app: <https://hantu-raya.github.io/custom-passive/>

## What it does

- Requires the verified `templete_06_19.7z` template archive before building.
- Caches template verification locally for 12 hours.
- Supports Passive Only, Passive + Actives, and Passive + Actives (No Behavior) presets from the 06/19 GameBanana filter archives.
- Defers preset template download until the user clicks Build.
- Lets users add or remove any shop item from the selected passive list.
- Patches `m_bShowInPassiveItemsArea` inside compiled `abilities.vdata_c` bytes.
- Compresses Binary KV3 with zstd and writes Source 2 compressed-size fields consistently for Deadlock compatibility.
- Writes a browser-generated `.7z` archive containing one VPK with `scripts/abilities.vdata_c`.
- Serves generated shop and item art as pruned WebP assets for lower bandwidth.
- Keeps archive processing local. There is no server-side upload or build step.

## Supported inputs

Required startup template:

- `templete_06_19.7z`

Preset sources verified by the build tooling:

- `filter_for_passive_items_06_19.7z`
- `filter_for_passive_and_active_items_yesBehaviour_06_19.7z`
- `filter_for_passive_and_active_items_06_19.7z`

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

Regenerate GameBanana preset templates and verify source archive selections:

```bash
npm run generate:presets
```

Both commands depend on local Deadlock/tool paths configured in `scripts/` and may not run on a fresh machine without those files.

Sync latest GameBanana file metadata and preset templates when the mod publishes a new complete batch:

```bash
npm run sync:gamebanana
```

The sync script uses the GameBanana API at build time only. It downloads archives, verifies MD5 from GameBanana, computes SHA-256 locally, extracts preset VPKs, writes static metadata, and updates `public/templates/gamebanana/`. It refuses to downgrade from the current generated batch unless you pass `-- --allow-downgrade`. If GameBanana has not published the required `templete_MM_DD.7z`, it fails by default; use `-- --allow-missing-template` only when keeping the current template is intentional.

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

Playwright uses `http://127.0.0.1:4321/custom-passive/` and expects the local `templete_06_19.7z` fixture at the configured `G:/SteamLibrary/.../addons/` path.

## Deployment

Astro is configured with:

- `site: "https://hantu-raya.github.io"`
- `base: "/custom-passive/"`

Build output is written to `dist/`.

GitHub Pages deploys from `.github/workflows/deploy.yml`. The workflow runs every 6 hours and on pushes to `main`; each run syncs GameBanana metadata before tests/build. If a new GameBanana batch cannot provide a full patchable template for every shop item, the workflow fails instead of deploying stale abilities.

## License

Apache-2.0. See `LICENSE`.

This is an unofficial fan-made tool. It is not affiliated with Valve.
