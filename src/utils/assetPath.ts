// Asset path helpers for deploying under a non-root base (e.g. GitHub Pages at
// /Bitblast/). At dev/root (base === '/') these are no-ops.
//
// The bulk of assets are loaded through THREE loaders, so `rewriteAssetUrl` is
// installed as a LoadingManager URL modifier (see main.ts / AssetManager) and
// fixes every model/texture/audio URL at load time without touching call sites.
// `assetUrl` is for the few non-THREE references (e.g. <img src> in HTML strings).

const BASE = import.meta.env.BASE_URL || '/';

/**
 * Prefix an asset path with the configured base. Accepts 'assets/x', '/assets/x'
 * or './assets/x' and always returns a base-rooted URL.
 */
export function assetUrl(path: string): string {
  return BASE + path.replace(/^\.?\//, '');
}

/**
 * LoadingManager.setURLModifier callback: rewrites any 'assets/...' style URL to
 * include the base. Leaves absolute (http/https/data/blob) URLs untouched.
 */
export function rewriteAssetUrl(url: string): string {
  if (BASE === '/') return url; // local dev: paths already resolve at root
  const match = url.match(/^\.?\/?(assets\/.*)$/);
  return match ? BASE + match[1] : url;
}
