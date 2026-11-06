import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// The Dota resourcecompiler writes no RERL block for Deadlock icons. Copy the stock
// one so ~560 ability/item icons load with the VData instead of hitching on first use.

// The Deadlock-mods-collection checkout (DEADLOCK_MODS_REPO overrides it).
const MODS_REPO = (process.env.DEADLOCK_MODS_REPO || 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection').replace(/\\/g, '/').replace(/\/$/, '');
const INJECTOR = `${MODS_REPO}/abilities/scripts/inject_stock_external_refs.py`;
const VPKEDIT_CLI = `${MODS_REPO}/vpk cli/vpkeditcli.exe`;
// The game's citadel folder (DEADLOCK_CITADEL overrides it, e.g. a Steam library on another drive).
const CITADEL = (process.env.DEADLOCK_CITADEL || 'G:/SteamLibrary/steamapps/common/Deadlock/game/citadel').replace(/\\/g, '/').replace(/\/$/, '');
const PAK01 = `${CITADEL}/pak01_dir.vpk`;

let stockVdataPath = null;

function extractStockVdata() {
  if (stockVdataPath) return stockVdataPath;
  const out = path.resolve('.tmp/stock-abilities/abilities.vdata_c');
  mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(VPKEDIT_CLI, ['--no-progress', '--extract', 'scripts/abilities.vdata_c', '--output', out, PAK01], { stdio: 'pipe' });
  stockVdataPath = out;
  return out;
}

export function injectStockExternalRefs(compiledPath, sourcePath) {
  try {
    execFileSync('python', [INJECTOR, compiledPath, sourcePath, extractStockVdata()], { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`RERL injection failed for ${compiledPath}\n${error.stderr?.toString() || error.message}`);
  }
}
