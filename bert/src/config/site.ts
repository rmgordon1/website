/**
 * Global site configuration.
 *
 * Media (images/videos) live in AWS S3 and are served through a CloudFront
 * distribution. Reference assets via `mediaUrl()` so the base can be swapped
 * (e.g. local `/static/...` during early dev vs. the CDN in production).
 */

// CloudFront distribution base (from media_mapping.txt).
export const CDN_BASE = 'https://dx09qkoz6th2f.cloudfront.net';

// Homepage videos live at `${CDN_BASE}/homepage/<file>.webm` (and matching .mp4).
// Set to '' to fall back to files in /public during local-only work.
export const MEDIA_BASE = CDN_BASE;

/** Build an absolute URL for a media asset (CloudFront in production). */
export function mediaUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${MEDIA_BASE}${clean}`;
}

export const site = {
  title: 'Bert — Art Portfolio',
  description: 'A static, media-driven art portfolio.',
} as const;
