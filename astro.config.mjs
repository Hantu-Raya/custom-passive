import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 7) || 'local';
  }
}

// One id per build, shared by the page bundle and dist/version.json.
const builtAt = new Date().toISOString();
const commit = currentCommit();
const webBuild = { buildId: `${commit}-${builtAt}`, commit, builtAt };

export default defineConfig({
  site: 'https://hantu-raya.github.io',
  base: '/custom-passive/',
  integrations: [preact()],
  vite: {
    define: {
      __WEB_BUILD__: JSON.stringify(webBuild)
    },
    resolve: {
      alias: {
        module: fileURLToPath(new URL('./src/lib/nodeModuleShim.js', import.meta.url))
      }
    }
  }
});
