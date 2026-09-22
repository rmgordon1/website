// @ts-check
import { defineConfig } from 'astro/config';

// Astro configuration
// - Static Site Generation (SSG) by default: zero client JS unless an island opts in.
// - Dev & preview servers bound to port 3000 (host: true so nginx can proxy to it).
export default defineConfig({
  // Canonical production URL. Apex only — www/http redirects belong on the host/DNS.
  site: 'https://thebertgordon.com',
  output: 'static',
  // Keep generated HTML readable (indented, not minified) for easier inspection.
  compressHTML: false,
  
  // Astro's server config
  server: {
    port: 3000,
    host: true,
  },
  
  // Pass Vite-specific config here
  vite: {
    server: {
      allowedHosts: ['thebertgordon.com'],
    },
    preview: {
      allowedHosts: ['thebertgordon.com'],
    },
  },
});