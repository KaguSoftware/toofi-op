// The product name is baked in from the repo-root brand.config.json by vite.config.ts.
// Under vitest there is no define, so the name is simply empty there.
declare const __PRODUCT_NAME__: string | undefined;

export const productName: string = typeof __PRODUCT_NAME__ === 'string' ? __PRODUCT_NAME__ : '';
