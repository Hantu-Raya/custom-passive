import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://hantu-raya.github.io',
  base: '/custom-passive/',
  integrations: [preact()]
});
