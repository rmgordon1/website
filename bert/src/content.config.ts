import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Projects / artwork collection.
 *
 * Each artwork is a Markdown file in `src/content/projects/`. The filename
 * (minus extension) becomes the URL slug: `src/content/projects/artpiece1.md`
 * → `/projects/artpiece1`.
 *
 * Media fields hold absolute URLs (CloudFront in production, or local
 * `/static/...` during early dev — use `mediaUrl()` from config/site.ts).
 */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    year: z.number().optional(),
    description: z.string().optional(),
    // Full-resolution image for the pan/zoom viewer.
    image: z.string().optional(),
    // Optional background video pair (alpha or standard).
    videoWebm: z.string().optional(),
    videoHevc: z.string().optional(),
    // Ordering / visibility helpers.
    order: z.number().default(0),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects };
