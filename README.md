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

Regenerate GameBanana preset templates and verify source archive selections:

```bash
npm run generate:presets
```

Both commands depend on local Deadlock/tool paths configured in `scripts/` and may not run on a fresh machine without those files.

Sync the latest complete GameBanana batch:

```bash
npm run sync:gamebanana
```

The sync script cache-busts GameBanana API requests, retries transient HTTP failures and truncated JSON, verifies archive MD5 values, computes SHA-256 locally, extracts preset VPKs, and writes static metadata. It refuses to downgrade from the current generated batch unless you pass `-- --allow-downgrade`.

If GameBanana's API remains unavailable, the command fails after its retries. GitHub Pages runs the same command with `-- --allow-stale-metadata`: it deploys the existing verified metadata and templates instead of failing. That fallback never writes new metadata; the next hourly run retries the live sync. Do not use it for a manual metadata update when the latest archive must be captured immediately.

GameBanana filters that omit passive flags for catalog items cannot replace browser patch templates. The sync keeps the current complete generated template in that case while still recording the latest preset archive metadata.

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

GitHub Pages deploys from `.github/workflows/deploy.yml`. The workflow runs hourly and on pushes to `main`. Each run retries cache-busted GameBanana API requests, syncs fresh metadata when possible, then runs tests and builds. If the API remains unavailable, it deploys the last verified generated metadata and tries the live sync again on the next hourly run.

## License

Apache-2.0. See `LICENSE`.

This is an unofficial fan-made tool. It is not affiliated with Valve.
