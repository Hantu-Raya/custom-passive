import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// The Dota resourcecompiler writes no RERL block for Deadlock icons. Copy the stock
// one so ~560 ability/item icons load with the VData instead of hitching on first use.
const INJECTOR = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/abilities/scripts/inject_stock_external_refs.py';
const VPKEDIT_CLI = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/vpk cli/vpkeditcli.exe';
const PAK01 = 'G:/SteamLibrary/steamapps/common/Deadlock/game/citadel/pak01_dir.vpk';

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
