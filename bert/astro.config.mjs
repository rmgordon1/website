// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://thebertgordon.com',
  output: 'static',
  compressHTML: false,
  
  // Astro's native server config applies to both dev and preview
  server: {
    port: 3000,
    host: true,
    allowedHosts: ['thebertgordon.com'],
  }
});