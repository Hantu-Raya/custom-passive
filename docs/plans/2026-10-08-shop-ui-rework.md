# Shop UI rework plan

Deadlock build 6762 replaced the buy menu. The builder still draws the old catalog, so its tabs, boards and backgrounds no longer match what players see in game.
This program rebuilds the item picker around the new menu. It adds a six-tab rail, stock tier regions on the Weapon, Spirit and Vitality boards, and a three-column tier board for Selected, Popular and All Items. Popular reads live per-hero item stats from deadlock-api.com. Search moves into All Items. Stock filters ship last.
The rule is that layout comes from the extracted stock files and is checked against the in-game references. Nothing is tuned by eye.
The browser build path stays as it is. Template gate, preset templates, VPK writing and downloads do not change. The program first moves to the 10_08 GameBanana batch, then holds those template bytes fixed.
PR ids in order are SHOP-0, SHOP-1, SHOP-2, SHOP-3, SHOP-4, SHOP-5 and SHOP-6.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`, adapted for this machine. One owner, the coding agent, builds a linear stack of commits on `feat/shop-ui-rework`. Each PR id is one commit or one small commit group with its own evidence. The operator decides whether each unit lands as a PR or a direct push, and runs the manual Pages deploy. SHOP-5 waits on operator-supplied filter data. See Appendix E for every deviation from the pstack playbook.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start. Re-read them before each PR id.
  - [ ] `git show origin/main:AGENTS.md`
  - [ ] `git show origin/main:playwright.config.mjs`
  - [ ] `git show origin/main:scripts/generate-custom-passive-data.mjs`
  - [ ] `git show origin/main:e2e/custom-passive.spec.js`
- [ ] Sync to the 10_08 batch as its own commit before SHOP-0, following the release checklist in `AGENTS.md`. The required template is file 1841451 (https://gamebanana.com/mods/download/601444#FileInfo_1841451).
  - [ ] Run `npm run sync:gamebanana` with no bypass flags. Pass when `src/data/gamebananaSources.generated.js` names `templete_10_08.7z` with `fileId` 1841451 and every archive MD5 matches the files in `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/`.
  - [ ] Run `npm run check`. Pass when generation, tests, build and E2E all pass and a second generator run leaves no diff. If `generate:presets` fails source-archive verification, stop and report. Do not use `--skip-source-archive-verification`.
  - [ ] Record the SHA-256 of `gamebananaSources.generated.js`, every file under `public/templates/gamebanana/` and `test/fixtures/templates/` in `test-results/shop-rework/template-pin.txt`.
- [ ] Hold the template pin. After every generator run in SHOP-1 to SHOP-6, the pinned hashes and preset selections must be unchanged. A change blocks the unit. Never run `sync:gamebanana` inside a UI unit.
- [ ] Skip the `/loop 1h` audit tick. This harness has no loop command. The owner audits against this plan at every commit instead.
- [ ] After each PR id, post one status message to the operator naming what changed, the evidence paths, and any new blocker. Post nothing when nothing changed.
- [ ] On the operator's hold, stop writing at once and leave the branch at the last verified commit.

### Spawn owners

- [ ] Run one owner, the coding agent, for SHOP-0 through SHOP-4 in order. Each unit starts after the previous one is verified.
- [ ] Follow this dependency graph.
  - [ ] SHOP-0 is first and branches from the verified 10_08 sync commit. That commit is "trunk" for every regression and perf comparison in this plan.
  - [ ] SHOP-1 after SHOP-0.
  - [ ] SHOP-2 after SHOP-1.
  - [ ] SHOP-3 after SHOP-2.
  - [ ] SHOP-4 after SHOP-3.
  - [ ] SHOP-5 after SHOP-4.
  - [ ] SHOP-6 after SHOP-5.
- [ ] Hold the file boundaries. SHOP-0 touches only `playwright.config.mjs`, `scripts/measure-shop-reference-anchors.mjs`, `e2e/` and `test/`. Generator units touch only `scripts/`, `src/data/*.generated.js` (by running the generator), `public/assets/deadlock/` (by running the generator) and `test/`. UI units touch only `src/components/`, `src/styles/`, `src/pages/`, `src/lib/popularItems.js`, `e2e/` and `test/`. SHOP-4 also edits `AGENTS.md` and deletes unused files in `public/assets/static/`.
- [ ] Hold the review gate. SHOP-2, SHOP-3, SHOP-4 and SHOP-6 change an interaction or a visible board. Each waits for the operator's review with screenshots and a video before it lands.

### PR mechanics, for every PR

- [ ] Use `gh` for any PR the operator asks for. Never use `gt`.
- [ ] Open a PR only when the operator asks. Open it ready, never draft, against `main` or the parent unit's branch.
- [ ] Run `npm test` and `npm run build` before each commit. Run `npm run check` for any unit that changes a generator, generated data or assets.
- [ ] Review the diff for dead code, stale selectors and leftover instrumentation before each commit.
- [ ] Keep the branch rebased on `main` before each review gate.

### Verdict and merge, for every PR

- [ ] At each unit's final commit, run the full unit, live and perf blocks for that unit and keep the artifacts under `test-results/shop-rework/<pr-id>/`.
- [ ] A unit is clean only when every box in its blocks passes. A failed box goes back to the owner. A new commit reruns the blocks it can affect.
- [ ] The operator lands each verified unit bottom-up. Pages deploy stays `gh workflow run deploy.yml -R Hantu-Raya/custom-passive`, run by the operator after SHOP-4.

### Boot recipe, for every live lane

Each live lane runs locally at the unit's head commit with Playwright Chromium.

- [ ] `git checkout <head SHA>` and `npm ci` when the lockfile changed.
- [ ] Confirm the archive named by `REQUIRED_GAMEBANANA_TEMPLATE.fileName` exists in `G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/addons/`, the path `e2e/custom-passive.spec.js` uploads from. Then let Playwright start `npm run dev -- --host 127.0.0.1`. Wait for `http://127.0.0.1:4321/custom-passive/`.
- [ ] Drive the page only through Playwright actions. Read state through DOM queries and downloaded files.
- [ ] Use viewport 1600x900 at device scale factor 1 unless the lane names another. Disable animations and hide the text caret for screenshots.
- [ ] Save every screenshot to `test-results/shop-rework/<pr-id>/lane-<n>/<slug>.png` and list the paths in the status message.

## Build the baseline and parity harness (SHOP-0)

**Depends on.** None.

**Files.**

- [ ] Edit `playwright.config.mjs` to add a fixed project at 1600x900, DPR 1, reduced motion, and screenshot settings.
- [ ] Create `e2e/visual.spec.js` with unchanged-surface baselines.
- [ ] Create `e2e/helpers/shopGeometry.js` with rect capture and tolerance helpers.
- [ ] Create `scripts/measure-shop-reference-anchors.mjs`, which records registered anchor rects from the in-game reference captures.
- [ ] Create `e2e/fixtures/shop-reference-anchors.json`, generated by that script and never edited by hand.
- [ ] Create `e2e/fixtures/shop-reference/` holding the agent's 1600x900 client captures from build 6763 with their SHA-256 values. These are `tab_weapon`, `tab_spirit`, `tab_vitality`, `tab_popular`, `tab_builds`, `all_items_00` to `all_items_03`, `popular_silver_00`, `popular_abrams_00`, `menu_Physical`, `menu_Spirit`, `menu_Defense`, `menu_Mobility`, `menu_Disruption`, `menu_Misc` and `flt_Physical_Ammo_00` from `D:/temp/ingame-6762/`, 18 files in all. They were taken with the pointer parked off the board, so no card is hovered.

**Build.**

- [ ] Write `scripts/measure-shop-reference-anchors.mjs`. It takes the documented shop crop for each reference and records the board rect, every nav tab rect, every tier region rect and the first card rect of each tier. It stores the source SHA-256 and the reference size (1600x900).
- [ ] Add web-vs-web screenshot baselines for surfaces this program must not change. These are the template gate, the build panel, the supporter footer, one item card in each state (off, selected, hovered, related-hover) and the compact viewport layout.
- [ ] Prove capture stability. Capture each baseline five times. If the bytes match every time, the tolerance is zero. If they do not, record the measured noise and fix the allowance at that value.
- [ ] Run the mutation checks, then revert them. Shift one tier region by 6px and break card wrapping. Each must fail its gate. Record the failing output in Appendix A. The missing-asset mutation belongs to SHOP-1, which builds the asset gate.

**You see.**

- [ ] `npx playwright test e2e/visual.spec.js` passes on `main` with committed baselines, and `e2e/fixtures/shop-reference-anchors.json` lists every reference capture with its hash.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/shopReferenceAnchors.test.js` checks that the anchor file covers all 18 named captures with their stored hashes, every nav tab, four tiers per category board, the price rows in each All Items snap and both Popular captures, and the menu and Active Filters bar rects used by SHOP-6. Run `npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `local Playwright Chromium 1600x900 DPR1` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the existing 21 E2E tests at trunk and head. Save `e2e-summary.png`. Pass when both runs report the same 21 passing tests.
- [ ] Lane 2. Capture the template gate five times. Save `template-gate.png`. Pass when all five captures are within the recorded allowance.
- [ ] Lane 3. Capture the build panel with the passive-only preset. Save `build-panel.png`. Pass when it matches the baseline within the allowance.
- [ ] Lane 4. Capture the supporter footer with the marquee paused. Save `support-footer.png`. Pass when it matches the baseline within the allowance.
- [ ] Lane 5. Capture one selected and one unselected card. Save `card-states.png`. Pass when both match the baseline within the allowance.
- [ ] Lane 6. Hover a card with known upgrade links. Save `card-hover-related.png`. Pass when the hovered card has `is-item-hovered` state on the shell and every linked card has `is-hover-related`.
- [ ] Lane 7. Capture the compact viewport at 1280x720. Save `compact.png`. Pass when it matches the baseline and the footer bottom is inside the viewport.
- [ ] Lane 8. Mutation, shift the weapon T2 region by 6px. Save `mutation-shift.png`. Pass when the geometry gate fails and names tier 2.
- [ ] Lane 9. Mutation, set the card grid to no-wrap. Save `mutation-wrap.png`. Pass when the coverage check fails and names the cards outside the board.
- [ ] Lane 10. Game-reference registration prototype. Register each reference's shop crop, crop the predetermined comparable regions (board frame, tier frames, rail), list the intentional exclusions (hero ownership markers, popularity data, web-only build panel), and compute the region diff metric against a capture of the current app. Save `registration.png` and `registration.json`. Pass when the script produces a diff image and a numeric result per region, and the fixed nonzero threshold is recorded in Appendix A.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from tab click to every visible card image decoded and painted, measured in the test, for the existing Weapon, Spirit, Vitality, Selected and Search tabs.
- [ ] Probe. A Playwright script clicks a tab, waits for the expected card count, awaits `img.decode()` on every visible card image, then waits two animation frames. Warm cache. Interleave trunk and head runs.
- [ ] Baseline. Record trunk medians and spread first. Raise the sample count above 5 when the spread is wider than 10% of the median.
- [ ] Rule. SHOP-0 adds no app code, so head must be within the measured noise of trunk. These trunk numbers become the reference for SHOP-2 to SHOP-4.

**Review gate.** None. SHOP-0 is not review-gated.

**Merge.**

- [ ] Every box above has its artifact under `test-results/shop-rework/SHOP-0/`.
- [ ] Mutation changes are reverted and `git diff` shows only the harness files.
- [ ] Rebased onto current `main`.
- [ ] The operator lands it.

## Generate the stock layout spec and shop surfaces (SHOP-1)

**Depends on.** SHOP-0.

**Files.**

- [ ] Edit `scripts/generate-custom-passive-data.mjs`.
- [ ] Create `src/data/shopLayout.generated.js` by running the generator.
- [ ] Regenerate `public/assets/deadlock/panorama/images/shop/` by running the generator.
- [ ] Edit `test/catalog.test.js` or create `test/shopLayout.test.js`.
- [ ] Create `test/fixtures/deadlock-api-item-ids.json` from one recorded API response.

**Build.**

- [ ] Extract the stock files with Source2Viewer-CLI from `pak01_dir.vpk`. These are `panorama/layout/citadel_hud_hero_shop.vxml_c`, `citadel_shop_mods_filtered.vxml_c`, `citadel_shop_mods_recommended.vxml_c`, `citadel_shop_mods_tier.vxml_c`, `citadel_shop_mod_view.vxml_c` and the matching `.vcss_c` styles. Record the build number and each file's CRC from the VPK listing.
- [ ] Parse only the selectors the app uses. These are the `.ShowingWeaponOnly`, `.ShowingSpiritOnly` and `.ShowingVitalityOnly` tier rows with their `x`, `y`, `width`, right-tier margins and cost-label margins, `#ModTiers` margins, cell padding, `#PassiveModsContainer` flow, `#MainPanel` size, `CitadelShopMod` size and margin, and nav order. Fail the run on a missing or unrecognized field.
- [ ] Emit `SHOP_LAYOUT` as a frozen object with provenance. Do not derive column counts. Columns come from the verified table settled by the SHOP-2 prototype.
- [ ] Add the required surfaces to the asset list. These are `catalog_shop_tab_shape_psd`, `catalog_shop_tab_edge_overlay_psd`, `catalog_shop_tab_icon_{weapon,spirit,vitality,builds,all,recommendations}_psd`, `catalog_shop_generic_bg2_psd`, `catalog_shop_popular_bg_psd`, `catalog_shop_top_recommendations_header_psd`, `catalog_shop_filter_bg_psd`, `filters/shop_filtered_tree_header_full_psd`, `pricetag_tier1..4_psd` and `price_currency_psd`. Leave filter sigils and backers for SHOP-6.
- [ ] Make a missing required surface fail the generator. Today extraction warns and WebP optimization skips missing PNGs.
- [ ] Add `statsId` to each generated item. It is MurmurHash2 of the lowercase class name with seed `0x31415926`, the id deadlock-api.com uses. Compute it locally so the generator needs no network.

**You see.**

- [ ] `npm run generate:data` prints the build number and layout provenance, and a second run leaves `git status` clean.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/shopLayout.test.js` asserts the weapon tier rows are `{1: x44 y120 w500, 2: x510 y10 w540, 3: x44 y480 w600, 4: x674 y480 w400}`, the spirit and vitality rows match their stock values, and every required surface file exists. It also checks every item's `statsId` against `test/fixtures/deadlock-api-item-ids.json`, a recorded `/v1/assets/items` map for all 156 catalog items with its retrieval time, and checks that each id is an unsigned 32-bit integer and unique. Run `npm run check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `local Playwright Chromium 1600x900 DPR1` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the SHOP-0 visual and E2E suites at trunk and head. Save `regression.png`. Pass when both pass with the same counts, since SHOP-1 changes no UI.
- [ ] Lane 2. Load each new surface URL under `/custom-passive/`. Save `surfaces-200.png`. Pass when every request returns 200 with an image content type.
- [ ] Lane 3. Load the built site with `npm run preview` under the base path. Save `preview-base.png`. Pass when no request goes to a root-relative `/assets/` URL.
- [ ] Lane 4. Render `catalog_shop_bg_weapon_psd.webp` alone. Save `bg-weapon.png`. Pass when the FAIRFAX header region is present at the anchor crop.
- [ ] Lane 5. Render `catalog_shop_bg_spirit_psd.webp` alone. Save `bg-spirit.png`. Pass when the CURIOSITY CATALOG header region is present at the anchor crop.
- [ ] Lane 6. Render `catalog_shop_bg_vitality_psd.webp` alone. Save `bg-vitality.png`. Pass when the MPS header region is present at the anchor crop.
- [ ] Lane 7. Render the four price stickers. Save `pricetags.png`. Pass when each decodes with nonzero size.
- [ ] Lane 8. Render the six tab icons. Save `tab-icons.png`. Pass when each decodes with nonzero size.
- [ ] Lane 9. Mutation, rename one required PNG in the extraction cache and run the generator. Save `missing-surface.png` of the terminal output. Pass when the generator exits nonzero and names the file. Revert and record it in Appendix A.
- [ ] Lane 10. Run the generator twice. Save `idempotent.png` of `git status`. Pass when the second run produces no diff.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Total bytes of shop surfaces requested on first load of the Selected tab, plus the SHOP-0 tab-to-paint time.
- [ ] Probe. Playwright request log on a cold cache, then the SHOP-0 probe, interleaved with trunk.
- [ ] Baseline. Record trunk bytes and tab-to-paint medians first.
- [ ] Rule. First-load surface bytes may not grow, because new surfaces load only on the tab that uses them. Tab-to-paint must stay within trunk noise.

**Review gate.** None. SHOP-1 is not review-gated.

**Merge.**

- [ ] `npm run check` passes and the generator is idempotent.
- [ ] The asset diff under `public/assets/deadlock/` is reviewed file by file.
- [ ] Rebased onto current `main`.
- [ ] The operator lands it.

## Rebuild the category boards on stock tier regions (SHOP-2)

**Depends on.** SHOP-1.

**Files.**

- [ ] Edit `src/components/CustomPassiveShop.jsx`.
- [ ] Edit `src/styles/global.css`.
- [ ] Edit `e2e/custom-passive.spec.js` and `e2e/visual.spec.js`.

**Build.**

- [ ] Prototype first and record it in Appendix A. Reproduce the reference column counts for every tier (weapon T1 shows 5 columns, which the 82px stock pitch does not explain). Settle the board's inner coordinate system and the logical-pixel tolerance.
- [ ] Replace `WEAPON_GUIDE_BOXES`, `VITALITY_GUIDE_BOXES`, `SPIRIT_GUIDE_BOXES`, `DEFAULT_GUIDE_BOXES` and `TIER_COLUMNS` with `SHOP_LAYOUT` regions plus the verified column table.
- [ ] Draw each tier's price with `pricetag_tier<N>_psd` and `price_currency_psd`, matching the stock cost-label offsets.
- [ ] Delete CSS that only served the old guide boxes.

**You see.**

- [ ] The Weapon board shows FAIRFAX with T1 top left, T2 top right, T3 bottom left and T4 bottom right, as in the `tab_weapon` reference capture.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/shopLayout.test.js` gains a case that every category tier's item count fits its verified column table without hiding an item. Run `npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `local Playwright Chromium 1600x900 DPR1` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open Weapon at trunk and head and toggle Close Quarters. Save `weapon-toggle.png`. Pass when both update `selected-count` by one and head's tier rects match the anchors.
- [ ] Lane 2. Weapon geometry. Save `weapon-board.png`. Pass when each tier rect is within the settled tolerance of `shop-reference-anchors.json`.
- [ ] Lane 3. Spirit geometry. Save `spirit-board.png`. Pass when each tier rect is within tolerance of the anchors.
- [ ] Lane 4. Vitality geometry. Save `vitality-board.png`. Pass when each tier rect is within tolerance of the anchors.
- [ ] Lane 5. Coverage. Save `coverage.png`. Pass when 156 distinct `item-card-*` ids render across the three boards and none sits outside its tier rect.
- [ ] Lane 6. Columns. Save `columns.png`. Pass when every tier's first-row card count matches the verified table.
- [ ] Lane 7. Price stickers. Save `pricetags.png`. Pass when each tier shows 800, 1600, 3200 or 6400 at the anchor offset.
- [ ] Lane 8. Hover near board edges. Save `hover-edge.png`. Pass when the hovered card's frame is not clipped by the board.
- [ ] Lane 9. Compact viewport 1280x720. Save `compact.png`. Pass when all cards stay inside the board and the card width stays at or above the SHOP-0 compact value.
- [ ] Lane 10. Parity overlay. Save `weapon-overlay.png`, `spirit-overlay.png` and `vitality-overlay.png`. Pass when the numeric region diff for each tier crop is within the documented tolerance.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. SHOP-0 tab-to-paint time for Weapon, Spirit and Vitality.
- [ ] Probe. The SHOP-0 probe, interleaved trunk and head.
- [ ] Baseline. Reuse the SHOP-0 trunk medians and re-measure trunk once on the same machine.
- [ ] Rule. Fail when a head median exceeds trunk median by more than 20%.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, 3, 4 and 10 screenshots into `test-results/shop-rework/review/SHOP-2-*.png`.
- [ ] Record a 30 to 60 second video of tab switching, toggling and hover. Save it as `test-results/shop-rework/review/SHOP-2.webm`.
- [ ] Post the screenshots and the video to the operator. Approve the new board baselines only with each overlay's diff image and its measured region result attached. Wait for the operator's go.

**Merge.**

- [ ] The operator approves the review gate.
- [ ] New board baselines are committed with their overlays.
- [ ] Rebased onto current `main`.
- [ ] The operator lands it.

## Add the three-column tier board (SHOP-3)

**Depends on.** SHOP-2.

**Files.**

- [ ] Edit `src/components/CustomPassiveShop.jsx`.
- [ ] Edit `src/styles/global.css`.
- [ ] Edit `e2e/custom-passive.spec.js` and `e2e/visual.spec.js`.

**Build.**

- [ ] Prototype the tier rows first and record it in Appendix A. Rows are 800, 1600, 3200 and 6400. Each row has Weapon, Spirit and Vitality cells. Cards wrap four across per cell. Row height follows the tallest cell. Settle sticky header and tier snap behavior.
- [ ] Replace `ListTierSection` with one `TierBoard` component. Selected and the current Search tab use it. Keep `catalog-list-board` as the board class, since predictive hover dimming, scale debug and E2E queries depend on it.
- [ ] Draw the column header with `shop_filtered_tree_header_full_psd` and the Selected surface with `catalog_shop_generic_bg2_psd`.
- [ ] Dim empty tier rows to 0.2 opacity at 40px height, as stock `.tierRow.EmptyTier` does.
- [ ] Keep "Select all shown" equal to the cards the board renders.

**You see.**

- [ ] The Selected tab shows the WEAPON, Spirit and Vitality header, then one row per price tier with cards in their category column.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/tierBoard.test.js` checks the grouping function. For all 156 items it returns 12 cells whose counts equal `{weapon: 7/16/19/11, spirit: 8/12/13/16, vitality: 8/15/14/17}`. Run `npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `local Playwright Chromium 1600x900 DPR1` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Select every item, then open Selected at trunk and head. Save `selected-all.png`. Pass when both show 156 cards and head shows them in 12 cells.
- [ ] Lane 2. Wrapping. Save `wrap.png`. Pass when no cell row holds more than four cards and weapon T3 shows 19 cards in five rows.
- [ ] Lane 3. Row height. Save `row-height.png`. Pass when each tier row's height equals its tallest cell within 1px.
- [ ] Lane 4. Empty tier. Clear the selection and select one T1 item. Save `empty-tiers.png`. Pass when T2 to T4 rows render at 40px with 0.2 opacity.
- [ ] Lane 5. Empty selection. Clear all. Save `empty-selected.png`. Pass when the board shows the empty state and "Select all shown" is disabled.
- [ ] Lane 6. Search view on the board. Type `spirit`. Save `search-board.png`. Pass when the rendered card count equals the filtered count and "Select all shown" selects exactly that many.
- [ ] Lane 7. Scroll. Scroll to 6400. Save `scroll-6400.png`. Pass when the header stays visible and the 6400 row is in view.
- [ ] Lane 8. Hover at scroll boundary. Save `hover-scroll.png`. Pass when a hovered card at the bottom edge is not clipped.
- [ ] Lane 9. Compact and narrow viewports at 1280x720, 900x800 (below the 960px breakpoint) and 390x844. Save `compact.png`, `tablet.png` and `phone.png`. Pass when no cell overflows horizontally and every card stays tappable.
- [ ] Lane 10. Parity overlay against `all_items_00`. Save `all-items-overlay.png`. Pass when the header and first row geometry are within the documented tolerance.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. SHOP-0 tab-to-paint time for Selected with all 156 items selected.
- [ ] Probe. The SHOP-0 probe, interleaved trunk and head.
- [ ] Baseline. Record the trunk median for the same 156-item Selected scenario first.
- [ ] Rule. Fail when the head median exceeds trunk by more than 20%.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 1, 2, 4 and 10 screenshots into `test-results/shop-rework/review/SHOP-3-*.png`.
- [ ] Record a 30 to 60 second video of selection, scrolling and search. Save it as `test-results/shop-rework/review/SHOP-3.webm`.
- [ ] Post the screenshots and the video to the operator with the parity overlay. Wait for the operator's go.

**Merge.**

- [ ] The operator approves the review gate.
- [ ] New baselines are committed with their overlay.
- [ ] Rebased onto current `main`.
- [ ] The operator lands it.

## Switch to the six-tab rail with All Items search and the Popular view (SHOP-4)

**Depends on.** SHOP-3.

**Files.**

- [ ] Edit `src/components/CustomPassiveShop.jsx`.
- [ ] Edit `src/styles/global.css`.
- [ ] Edit `e2e/custom-passive.spec.js`, `e2e/visual.spec.js` and `test/searchHeaderCss.test.js`.
- [ ] Create `src/lib/popularItems.js` for the fetch, cache and popularity rule.
- [ ] Create `test/popularItems.test.js` and `e2e/fixtures/deadlock-api/` holding recorded real API responses.
- [ ] Edit `AGENTS.md` to update the stable selector list and record the deadlock-api.com dependency.

**Build.**

- [ ] Order the rail as stock does. Selected (builds star), Popular (recommendations icon), All Items (grid), Weapon, Spirit, Vitality. The active tab uses `catalog_shop_tab_shape_psd` at full length. Inactive tabs are short. Labels stay in the accessible name and show as a tooltip.
- [ ] Add `tab-all` and `tab-popular`. Remove `tab-search` and update every caller. Keep `search-input` and `clear-search`.
- [ ] Put the search box in the All Items header. Leaving All Items clears the query, as `changeTab` does today. Do not show "Backspace to Search" unless that shortcut works outside text fields.
- [ ] Build the Popular view on `catalog_shop_popular_bg_psd` and `catalog_shop_top_recommendations_header_psd`. A hero picker (`popular-hero-select`) lists heroes from `/v1/assets/heroes?only_active=true`, plus All heroes as the default.
  - [ ] Fetch the hero list and `/v1/analytics/item-stats` only while the Popular tab is open, never at startup or during a build. Send `hero_id` (omitted for All heroes), `game_mode=normal` and `min_unix_timestamp` set to 30 days ago rounded down to the hour. The API docs state the same 30-day default, but the request states it so the label is true. The API allows any origin, caches for 600s and limits 200 requests a minute per IP.
  - [ ] Abort the request after 8 seconds. Abort or ignore an older hero's request when the hero changes. Share one pending request per cache key. Do not retry on 429 and do not cache failures.
  - [ ] Validate the response at the boundary. It must be an array of rows with integer `item_id` and non-negative integer `players`. Drop unknown ids. Sum duplicate rows.
  - [ ] Cache the raw validated rows in `sessionStorage` under a key holding the hero id and the request window, with the fetch time. Expire after 10 minutes. Treat a malformed cache or a `sessionStorage` error as a cache miss.
  - [ ] Recompute the popular set on render from the raw rows. Take the maximum `players` over supported catalog items only. Show an item when its `players` is positive and at least 22% of that maximum. Order cards within each tier and category by item name, as the game does. The 22% threshold is a named constant in `popularItems.js`, recorded in Appendix A.
  - [ ] Show three distinct states. Cards when data exists. "No popularity data for this hero yet" for a valid empty response. "Popularity data unavailable" with the reason in status text on timeout, network error, 429 or invalid data. Never fill the board with guessed items. The build panel and download keep working offline.
  - [ ] Opening Popular never changes the selection. Toggling a card there changes only the selection.
  - [ ] Label the board as third-party popularity, not the in-game recommendation, with the requested window and fetch time, for example "Popular on deadlock-api.com since 8 Sep 2026, fetched 15:20". Update the footer notice to say the Popular tab contacts deadlock-api.com.
- [ ] Remove the static fallbacks in `public/assets/static/` that no view uses any more, along with `TAB_ICONS.search` and `SHOP_BACKGROUNDS.selected`.

**You see.**

- [ ] The rail shows six tabs in stock order. All Items shows the search box above the three-column board. Popular with Silver selected shows Close Quarters and Restorative Shot in the Weapon 800 cell and Extra Health, Extra Regen, Extra Stamina, Grit and Melee Lifesteal in the Vitality 800 cell, as the game did.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/searchHeaderCss.test.js` and `test/browserBuildPath.test.js` are updated for the removed Search tab, and a new case checks no source file references `assets/static/` paths that were deleted. `test/popularItems.test.js` feeds the recorded Silver response through the rule and asserts the literal 800-row ids. It also covers malformed rows, a malformed cache, a throwing `sessionStorage`, cache expiry, an empty response, a timeout, and a hero switch from A to B where A resolves last and B's result stays on screen. Run `npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `local Playwright Chromium 1600x900 DPR1` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Select three items, build and download at trunk and head. Save `download.png`. Pass when both archives hold one VPK whose `scripts/abilities.vdata_c` has exactly those three passive flags set.
- [ ] Lane 2. Rail order and geometry. Save `rail.png`. Pass when the tab order is selected, popular, all, weapon, spirit, vitality and the active tab rect is within tolerance of the anchors.
- [ ] Lane 3. Keyboard. Tab through the rail, press Enter on each tab, then Tab to a card and press Space. Save `keyboard.png`. Pass when every tab and card is reachable with a visible focus ring, each tab activates, and Space toggles the card's `aria-pressed`.
- [ ] Lane 4. Search lifecycle. Type `lifesteal` in All Items, switch to Weapon, return. Save `search-cycle.png`. Pass when the query is empty on return and all 156 cards show.
- [ ] Lane 5. No matches and Clear. Select two items, type `zzzz`, then click `clear-search`. Save `no-match-clear.png`. Pass when `zzzz` shows the empty message with "Select all shown" disabled, and Clear empties the query, restores 156 cards and leaves `selected-count` at 2.
- [ ] Lane 6. Popular view from the recorded Silver response, served with `page.route`. Clear the selection, open Popular, pick Silver. Save `popular-silver.png`. Pass when the board shows exactly the ids the rule selects from the fixture and `selected-count` stays 0. Then toggle one card and press "Select all shown". Pass when the first changes `selected-count` by one and the second selects exactly the rendered ids.
- [ ] Lane 7. Popular failure. Abort the API route, open Popular, then build and download. Save `popular-offline.png`. Pass when the board shows "Popularity data unavailable" with no cards, and the download still succeeds.
- [ ] Lane 8. Persistence. Select items, reload. Save `persist.png`. Pass when `custom-passive:selected-items:v2` holds the sorted ids and the selection survives the reload.
- [ ] Lane 9. Base path and live API smoke. Run against `npm run preview` and open Popular with no route mock. Save `base-path-live.png`. Pass when every app request stays under `/custom-passive/`, the only other origin is `api.deadlock-api.com`, and a validated real response renders cards through the browser's CORS path. If the API is down, the lane records the unavailable state as failure-handling evidence and marks live integration unverified. It does not pass.
- [ ] Lane 10. Parity overlay against `popular_silver_00` and `all_items_00`. Save `rail-overlay.png`. Pass when rail and header geometry are within the documented tolerance.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Tab-to-paint for Weapon, Spirit, Vitality and Selected against trunk, plus absolute time for the new All Items tab and for Popular with the recorded response.
- [ ] Probe. The SHOP-0 probe, interleaved trunk and head, with the sample count set by SHOP-0's measured spread.
- [ ] Baseline. Record trunk medians for the four existing tabs first.
- [ ] Rule. Existing tabs fail at more than 20% over trunk. All Items and Popular (recorded response, network excluded) fail above 150ms median, a provisional budget that the SHOP-3 prototype must confirm as reachable.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, 4, 6 and 10 screenshots into `test-results/shop-rework/review/SHOP-4-*.png`.
- [ ] Record a 30 to 60 second video of every tab, a search, the Popular view with a hero change and a download. Save it as `test-results/shop-rework/review/SHOP-4.webm`.
- [ ] Post the screenshots and the video to the operator. Wait for the operator's go.

**Merge.**

- [ ] The operator approves the review gate.
- [ ] `AGENTS.md` lists `tab-all`, `tab-popular` and `popular-hero-select`, no longer lists `tab-search`, and records the deadlock-api.com dependency.
- [ ] Rebased onto current `main`.
- [ ] The operator lands it and runs the Pages deploy when ready.

## Generate verified filter membership (SHOP-5)

**Depends on.** SHOP-4.

**Files.**

- [ ] Create `test/fixtures/shop-filter-oracle.json` from `D:/temp/ingame-6762/shop_oracle_6763.json`, the in-game capture described in Appendix A.
- [ ] Edit `scripts/generate-custom-passive-data.mjs`.
- [ ] Regenerate `src/data/deadlockItems.generated.js` with a `filters` array per item.
- [ ] Create `test/shopFilters.test.js`.

**Build.**

- [ ] Use the captured oracle. It holds the visible item ids for all 55 filter entries on build 6763 with no hero, an empty query and every tier scrolled, plus one OR combination. Recapture with the same procedure if the client version changes before SHOP-5 runs.
- [ ] Generate group membership as the union of child filters. The capture shows every group equals that union.
- [ ] Derive membership from `m_eProvidedPropertyType`, `m_eAdditionalShopFilters`, `m_eDisableShopFilters`, `m_eScaleStatFilter` and item inheritance. Use client.dll research only to explain a mismatch. The 6762 DLL has no IDB, so start from the 6711 IDB and re-find every address in 6762.
- [ ] Stop and report if any oracle set cannot be reproduced. Do not ship guessed membership.

**You see.**

- [ ] `npm run generate:data` prints a filter count per category that equals the oracle.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/shopFilters.test.js` checks every oracle set and every combination against the generated data as literal id lists. Run `npm run check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `local Playwright Chromium 1600x900 DPR1` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run the full E2E suite at trunk and head. Save `regression.png`. Pass when both pass, since SHOP-5 adds data and no UI.
- [ ] Lane 2. Physical sets. Save `physical.png` of the test report. Pass when every Physical sub-filter matches the oracle.
- [ ] Lane 3. Spirit sets. Save `spirit.png`. Pass when every Spirit sub-filter matches the oracle.
- [ ] Lane 4. Defense sets. Save `defense.png`. Pass when every Defense sub-filter matches the oracle.
- [ ] Lane 5. Mobility sets. Save `mobility.png`. Pass when every Mobility sub-filter matches the oracle.
- [ ] Lane 6. Disruption sets. Save `disruption.png`. Pass when every Disruption sub-filter matches the oracle.
- [ ] Lane 7. Misc sets. Save `misc.png`. Pass when every Misc sub-filter matches the oracle.
- [ ] Lane 8. Groups. Save `groups.png`. Pass when each of the nine group filters equals the union of its children and the oracle group set.
- [ ] Lane 9. OR combination. Save `or.png`. Pass when Weapon Damage OR HP gives the 71 ids the game showed.
- [ ] Lane 10. Idempotence. Run the generator twice. Save `idempotent.png`. Pass when the second run leaves no diff.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Gzipped size of `deadlockItems.generated.js` in the built bundle.
- [ ] Probe. `npm run build`, then measure the emitted chunk at trunk and head.
- [ ] Baseline. Record the trunk size first.
- [ ] Rule. Fail when the chunk grows by more than 4 KB gzipped.

**Review gate.** None. SHOP-5 is not review-gated.

**Merge.**

- [ ] Every oracle set passes.
- [ ] Rebased onto current `main`.
- [ ] The operator lands it.

## Add the stock filter bar to All Items (SHOP-6)

**Depends on.** SHOP-5.

**Files.**

- [ ] Edit `scripts/generate-custom-passive-data.mjs` to add filter sigils and backers.
- [ ] Edit `src/components/CustomPassiveShop.jsx` and `src/styles/global.css`.
- [ ] Edit `e2e/custom-passive.spec.js` and `e2e/visual.spec.js`.

**Build.**

- [ ] Add `filters/sigil_{physical,magic,defense,mobility,disruption,misc}_psd`, `filter_nav_backer_psd`, `filter_backer_dot_pattern_psd` and the section icons to the required surfaces.
- [ ] Build the bar from stock `citadel_ui_shop_filters` structure. Six categories open sub-filter menus on hover, focus and tap. Left click selects one filter. Right click, or Ctrl with Enter, adds a filter. Multiple filters combine with OR only, because the game hides its AND switch (`#FilterAndOrSwitch` is `visibility: collapse`). Show the Active Filters bar at the bottom with removable breadcrumbs, the OR separator and Clear.
- [ ] Intersect filters with the search query. "Select all shown" selects exactly the cards rendered.

**You see.**

- [ ] All Items shows the six filter categories, and choosing Physical then Ammo narrows the board to the oracle's Ammo set.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `test/shopFilters.test.js` gains cases for the pure filter function with single selection, OR combination and query intersection against literal id lists. Run `npm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `local Playwright Chromium 1600x900 DPR1` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Search `lifesteal` in All Items at head and in Search at trunk. Save `search-regress.png`. Pass when both show the same ids.
- [ ] Lane 2. Single filter. Choose Physical then Ammo. Save `ammo.png`. Pass when rendered ids equal the oracle Ammo set.
- [ ] Lane 3. Replace. Choose Ammo, then left click Fire Rate. Save `replace.png`. Pass when only Fire Rate stays active and ids equal the oracle Fire Rate set.
- [ ] Lane 4. OR. Choose Weapon Damage, then right click HP. Save `or.png`. Pass when the bar shows the OR separator and ids equal the 71-id oracle union.
- [ ] Lane 5. Breadcrumb removal. Remove one breadcrumb. Save `breadcrumb.png`. Pass when the board returns to the single-filter set.
- [ ] Lane 6. Clear filters. Save `clear.png`. Pass when all 156 cards return.
- [ ] Lane 7. Filter plus search. Save `filter-search.png`. Pass when ids equal the filter set intersected with the query.
- [ ] Lane 8. Keyboard menus. Open each category with the keyboard. Save `filter-keyboard.png`. Pass when each menu opens, is navigable and closes with Escape.
- [ ] Lane 9. Touch. Emulate a touch device and tap a category. Save `filter-touch.png`. Pass when the menu opens without hover.
- [ ] Lane 10. Parity overlay against the `menu_Physical` and `flt_Physical_Ammo_00` captures. Save `filter-overlay.png`. Pass when the filter bar geometry is within the documented tolerance.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Query-to-paint for All Items search, measured on both revisions, plus filter-click-to-paint as new work on head only.
- [ ] Probe. Playwright types a query or clicks a filter, waits for the expected count, then waits two animation frames. Interleave trunk and head for the search probe.
- [ ] Baseline. Record the trunk search-to-paint median first, then the head filter-to-paint spread.
- [ ] Rule. Search fails at more than 20% over trunk. Filter-to-paint gets an absolute budget, provisionally 100ms median, which the SHOP-6 prototype must justify from measured data before it gates.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2, 3, 7 and 10 screenshots into `test-results/shop-rework/review/SHOP-6-*.png`.
- [ ] Record a 30 to 60 second video of filtering, adding a second filter, and clearing. Save it as `test-results/shop-rework/review/SHOP-6.webm`.
- [ ] Post the screenshots and the video to the operator. Wait for the operator's go.

**Merge.**

- [ ] The operator approves the review gate.
- [ ] Rebased onto current `main`.
- [ ] The operator lands it and runs the Pages deploy.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Every row in Appendix D shows its closing artifact. Rows still marked unproven are named in the final report.
- [ ] Reply to the operator with the units landed, the artifact paths, and what remains.

## Appendix A. Prototype evidence

No UI prototype has run yet. Two data experiments and one in-game capture session ran during planning and are listed below. The debate approved the approach, not unrun evidence. Each question below stays unproven until its artifact is recorded here with the branch, the SHA and the files.

| Question | Settled in | Status |
|---|---|---|
| Why weapon T1 shows 5 columns when 500px divided by the 82px stock pitch gives 6, and the verified column table for all twelve tiers | SHOP-2 prototype | Unproven |
| The board's inner coordinate system and the logical-pixel tolerance for geometry checks | SHOP-2 prototype | Unproven |
| Whether repeated captures are byte-stable, or the measured noise allowance | SHOP-0 | Unproven |
| Reference registration, comparable regions, intentional exclusions, the region diff metric and its fixed nonzero threshold. Rect tolerance in logical px is a separate number. | SHOP-0 lane 10 | Unproven |
| That the shift and wrap mutations fail their gates | SHOP-0 | Unproven |
| That a missing required surface fails the generator | SHOP-1 | Unproven |
| Four-across wrapping, tallest-cell rows, sticky header and hover at scroll edges | SHOP-3 prototype | Unproven |
| Whether 150ms is a reachable budget for the new tabs | SHOP-3 prototype | Unproven |
| Popular rule against the game. The game's numbers come from Valve's servers, so match is approximate | SHOP-4 | Shown on build 6763 for two heroes. The game showed 33 Popular items for Silver and 31 for Abrams. A 22% of top-item cutoff on the API's 30-day data gives 32 hits, 6 extra and 1 missed for Silver, and 30 hits, 3 extra and 1 missed for Abrams. 25% gives 30/3/3 and 28/3/3. Per-tier top-K is no better. Cards in the game's Popular view are in name order. Data in `D:/temp/popularity-prototype.json` and `D:/temp/ingame-6762/shop_oracle_6763.json`. |
| API item ids | SHOP-1 | Shown on 2026-10-08. MurmurHash2(lowercase class name, seed 0x31415926) equals the id for 250 of 250 items in `/v1/assets/items/by-type/upgrade`, saved at `D:/temp/upg.json`. SHOP-1 commits the 156-item fixture with its hash and retrieval time. |
| Reproducible extraction of stock CSS from pak01 with provenance | SHOP-1 | Partly shown. Source2Viewer-CLI 19.2 extracted all eleven shop layouts and styles on 2026-10-08 into `D:/temp/cp-shop-6762/`. |
| Filter oracle | SHOP-5 | Captured on 2026-10-08, client 6763, no hero, empty query, every tier scrolled. All 55 entries were selected one at a time and checked by their breadcrumb text. Visible cards were identified by matching against icons cut from the game's own All Items view, which found all 156 items with no misses. Every group equals the union of its children. Weapon Damage OR HP gave exactly the union, 71 items. Data and screenshots in `D:/temp/ingame-6762/`. |
| Filter membership rules from VData | SHOP-5 | Unproven. The oracle is the target the derivation must reproduce. |

Facts already checked during planning.

- The references are 1600x900. 1568x882 is the preview size.
- The game reported ClientVersion 6763 during the capture. The extracted shop layouts and styles have the same CRCs as on 6762.
- The game hides the filter AND switch (`#FilterAndOrSwitch` has `visibility: collapse`). Left click selects one filter, right click adds one, and multiple filters combine with OR.
- With no hero, Popular shows only the four empty price rows. The Builds tab with no build shows the blue header strip with Quick Buy and Build Browser over the generic surface.
- On the category boards the game shows hero-unusable items greyed out and marks popular items with a small hero portrait. Neither applies without a hero, so neither is in scope.
- The catalog has 156 items. Weapon tiers hold 7, 16, 19 and 11. Spirit holds 8, 12, 13 and 16. Vitality holds 8, 15, 14 and 17.
- Stock `#MainPanel` is 1200x960 and includes the nav rail. `CitadelShopMod` is 76x114 with a 3px margin. `#PassiveModsContainer` uses `right-wrap`.
- The stock category tabs reuse `CitadelShopModsFiltered` with `.ShowingWeaponOnly`, `.ShowingSpiritOnly` and `.ShowingVitalityOnly`. Their tier rows are absolutely placed. Weapon is T1 x44 y120 w500, T2 x510 y10 w540, T3 x44 y480 w600, T4 x674 y480 w400.
- Stock backgrounds are `catalog_shop_bg_{weapon,spirit,vitality}_psd`, `catalog_shop_popular_bg_psd`, `catalog_shop_filter_bg_psd` and `catalog_shop_generic_bg2_psd`. The old `catalog_shop_generic_bg_psd` and `catalog_shop_builds_bg_psd` are gone from pak01.
- Most items have `m_eAdditionalShopFilters = ""`, so filter membership comes mainly from provided property types through client code.
- The current Playwright config has no fixed viewport and no screenshot assertions.

## Appendix B. Alternatives rejected

- Pixel-exact diff of the web app against game screenshots. Fonts, ownership markers, card text layout and the web build panel differ, so a zero-diff rule can never pass and masks would grow until they hide real errors. Registered region overlays with a fixed tolerance replace it, and web-vs-web baselines are the hard regression gate.
- Deriving columns from tier width divided by card pitch. It predicts 6 columns for weapon T1 where the game shows 5.
- Checking rendered geometry only against the generated stock spec. That proves consistency, not parity, since the same wrong origin or scale would pass twice. The independent reference anchors catch it.
- Fixed-capacity grids, such as four cards per tier cell. Weapon T3 has 19 items and would be truncated.
- Percent boxes tuned by hand. This is what the current guide boxes do, and they drifted when the game changed.
- A Preset view in the Popular slot. Live per-hero stats from deadlock-api.com make the real Popular tab possible, and presets already have the Build mode selector.
- A build-time popularity snapshot. It goes stale between manual deploys, and the API allows browser requests from any origin.
- Fetching stats through the generator. MurmurHash2 of the class name reproduces all 250 API item ids, so only the browser needs the network.
- Keeping `tab-search` as an alias of `tab-all`. Two names for one tab would outlive the migration.
- Shipping filters from a heuristic mapping. Wrong membership would look authoritative.

## Appendix C. Risks

- Generator asset loss. A missing PNG used to be skipped silently. SHOP-1 makes it fatal and lane 9 proves it.
- deadlock-api.com availability and rate limits. A 200 requests a minute per IP limit is ample for one tab, and failure shows a clear message. Watched in SHOP-4 lanes 7 and 9.
- Upstream drift. Valve can move tier boxes again. Regenerating the layout spec and rerunning the anchor checks shows the change, but the anchor fixture also needs new reference screenshots. Watched in SHOP-1 and SHOP-2.
- Cards too small on compact screens. Stock regions are sized for 1600x900. SHOP-2 lane 9 holds the minimum card width.
- Scroll and hover clipping on the tier board. SHOP-3 lanes 7 and 8.
- Reference normalization. Wrong crop registration would bless a wrong layout. The anchor script records hashes and crops, and baseline approval requires the overlays.
- Filter drift. The oracle is from client 6763. A later client can change filter rules, so SHOP-5 recaptures it if the client version changed.
- Predictive hover depends on card rects. A layout change can shift prediction. SHOP-0 lane 6 keeps a behavior baseline.

## Appendix D. Acceptance ledger

Each row is one required outcome. It closes only with the named artifact. A passing suite does not close an unrelated row.

| Outcome | Evidence | Closed by |
|---|---|---|
| Six tabs in stock order with stock active and inactive geometry | SHOP-4 lane 2 rects and `rail-overlay.png` | SHOP-4 |
| Weapon, Spirit and Vitality tier regions match the game | SHOP-2 lanes 2 to 4 and overlays | SHOP-2 |
| All 156 items reachable, none hidden or clipped | SHOP-2 lane 5 and SHOP-3 lane 1 | SHOP-2, SHOP-3 |
| Popular shows per-hero items from deadlock-api.com, never changes the selection, and fails visibly without guessing | SHOP-4 lanes 6, 7 and 9 | SHOP-4 |
| Search lifecycle, empty query, no match and Clear | SHOP-4 lanes 4 and 5 | SHOP-4 |
| Empty tier rows dimmed | SHOP-3 lane 4 | SHOP-3 |
| Keyboard access to tabs and cards, compact, tablet and phone layouts | SHOP-2 lane 9, SHOP-3 lane 9, SHOP-4 lane 3 | SHOP-4 |
| Card, hover and upgrade highlighting unchanged | SHOP-0 lanes 5 and 6 rerun at each later unit | SHOP-4 |
| Persistence and bulk selection | SHOP-3 lane 6, SHOP-4 lane 8 | SHOP-4 |
| Downloaded VPK has exactly the selected flags | SHOP-4 lane 1 | SHOP-4 |
| Template gate, build panel and footer unchanged, except the footer's new deadlock-api.com notice. Supporter data and footer geometry stay the same | SHOP-0 baselines rerun at SHOP-4 | SHOP-4 |
| Templates and preset selections unchanged by the UI work after the 10_08 sync | `template-pin.txt` compared after every generator run | Every unit |
| Every asset loads under `/custom-passive/` | SHOP-1 lane 3, SHOP-4 lane 9 | SHOP-4 |
| Filter membership matches the game | SHOP-5 lanes 2 to 9 against the captured 6763 oracle | SHOP-5 |
| Filter bar behaves like stock | SHOP-6 lanes 2 to 10 | SHOP-6 |

## Appendix E. Deviations from the pstack playbook

- No cloud swarm, Bugbot or `/loop` exists in this environment. Live lanes are local Playwright scenarios run by the owner. No verdict claims cloud verification.
- PR ids are ordered commits on one branch. The operator chooses PR or direct push for each.
- Plan settled by a recorded debate between Claude and GPT-6.1-Sol, which reached consensus on the approach with the open questions above left unproven.

## Appendix F. Links and reading list

- `AGENTS.md` in this repo, especially the runtime rules, stable selectors and verification sections.
- Stock sources from pak01 build 6762. Extract with `Source2Viewer-CLI.exe -i <pak01_dir.vpk> --vpk_filepath panorama/layout/<name>.vxml_c -o <dir> -d`, and the same for `panorama/styles/<name>.vcss_c`. The readable mirror is SteamTracking/GameTracking-Deadlock under `game/citadel/pak01_dir/panorama/`.
- The operator's first reference screenshots in `D:\steam\userdata\215334735\760\remote\1422450\screenshots\`, files `20261008151627_1.jpg` through `20261008151809_1.jpg`.
- The agent's in-game captures, filter oracle and icon templates from client 6763 in `D:/temp/ingame-6762/`. Repeat the capture with the `deadlock-launch-vconsole` skill in Deadlock-mods-collection, a 1600x900 window, and the pointer parked off the board.
- Filter research for SHOP-5 only. `docs/2026-06-01-client-dll-panorama-ui-research.md` in Deadlock-mods-collection, the 6711 IDB at `D:\temp\ida6711\client.dll.i64`, and client.dll 6762 SHA-256 `0e2db1f7d705ec8a8cd9ed43bf6d762c0a62b4228a1fc5fd1856278a7f4e003a`.
