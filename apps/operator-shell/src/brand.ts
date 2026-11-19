// Brand strings come from the repo-root brand.config.json. esbuild.config.mjs
// and vitest.config.ts bake it in as __BRAND__, so the shell has no runtime
// path to the file and a rename stays a one-file change.

export interface Brand {
  productName: string;
  appId: string;
  releasesOwner: string;
  releasesRepo: string;
  installerName: string;
  protocolPrefix: string;
}

declare const __BRAND__: Brand;

export const brand: Brand = __BRAND__;

declare const __SUPABASE_URL__: string;

/** The Supabase project URL baked in at build time (CSP connect-src); '' when unset. */
export const supabaseUrl: string = __SUPABASE_URL__;
