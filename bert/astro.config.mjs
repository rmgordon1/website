// @ts-check
import { defineConfig } from 'astro/config';

// Astro configuration
// - Static Site Generation (SSG) by default: zero client JS unless an island opts in.
// - Dev & preview servers bound to port 3000 (host: true so nginx can proxy to it).
export default defineConfig({
  // Update this to your production domain when deploying.
  site: 'https://example.com',
  output: 'static',
  // Keep generated HTML readable (indented, not minified) for easier inspection.
  compressHTML: false,
  server: {
    port: 3000,
    host: true,
  },
});
