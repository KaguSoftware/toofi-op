// @rop/config: shared ESLint flat-config presets.
//
// Usage (eslint.config.mjs in an app or package):
//
//   import { base, react, clientSecrets } from '@rop/config/eslint';
//   export default [...base, ...react, ...clientSecrets];
//
// `no-restricted-syntax` is NOT merged by ESLint: the last entry that defines it
// wins outright. A package that wants several guards composes ONE array with
// `composeRestrictedSyntax(rtlGuardRules, clientSecretRules)` inside a single
// config object.
//
// `rtlGuard` is already part of `base`. `clientSecrets` is opt-in and belongs on
// every package that ships to a browser or a renderer process.
//
// Plain .js on purpose: ESLint loads this file directly, and the packages ship raw
// TS with no build step, so the config must not need one either.

import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * RTL guard: forbid physical CSS properties in JS/TS style objects.
 *
 * The app is bilingual EN/AR with full RTL, so the house rule is CSS logical
 * properties only (marginInlineStart, insetInlineEnd, textAlign: 'start', ...).
 * These selectors catch the common physical forms when they appear as object keys
 * (inline `style={{ ... }}`, CSS-in-JS objects) or as `textAlign: 'left' | 'right'`.
 *
 * The identifier-key selector is a /regex/: esquery reads a quoted string as an
 * exact match, which would silently match nothing.
 *
 * Known limitations (accepted):
 *  - Only sees JS/TS ASTs. Plain `.css` files are not checked.
 *  - Key matching is lexical: a non-style object with a `left`/`right` key will
 *    false-positive. Suppress locally with a reason.
 *  - Computed keys and spread-in styles are invisible to it.
 */
const physicalPropPattern =
  '^(marginLeft|marginRight|paddingLeft|paddingRight|' +
  'borderLeft|borderRight|borderLeftWidth|borderRightWidth|' +
  'borderLeftColor|borderRightColor|borderLeftStyle|borderRightStyle|' +
  'borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|' +
  'left|right)$';

export const rtlGuardRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector: `Property[key.name=/${physicalPropPattern}/][computed=false]`,
      message:
        'Physical CSS property: use logical properties instead (marginInlineStart, ' +
        'paddingInlineEnd, insetInlineStart, borderStartStartRadius, ...). The app is RTL-safe.',
    },
    {
      // Descendant, not child: `textAlign: cond ? 'right' : 'left'` is the same thing.
      selector: `Property[key.name='textAlign'] Literal[value=/^(left|right)$/]`,
      message: "textAlign: 'left'|'right' is physical: use 'start' | 'end'. The app is RTL-safe.",
    },
    {
      // A direction-conditional 'row-reverse' double-flips: a plain 'row' already
      // mirrors under the layout direction.
      selector: `Property[key.name='flexDirection'] ConditionalExpression Literal[value='row-reverse']`,
      message:
        "A direction-conditional 'row-reverse' double-flips: a plain 'row' mirrors under the layout direction.",
    },
    {
      // String-key variant: { 'margin-left': ... } / { 'padding-right': ... }
      selector: `Property[key.value=/^(margin-left|margin-right|padding-left|padding-right|border-left|border-right|left|right)$/]`,
      message:
        'Physical CSS property: use logical properties instead (margin-inline-start, ' +
        'padding-inline-end, inset-inline-start, ...). The app is RTL-safe.',
    },
  ],
};

/** A config entry applying only the RTL guard. */
export const rtlGuard = [
  {
    name: '@rop/rtl-guard',
    rules: rtlGuardRules,
  },
];

/**
 * Client-secret guard. The service_role key bypasses RLS entirely; its only
 * legitimate home is a server (packages/db tooling, CI). In a browser or renderer
 * bundle it is readable by anyone who opens devtools, so it is a lint error in
 * every client package.
 */
export const clientSecretRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector: `Literal[value=/service_role|sb_secret_/]`,
      message:
        'service_role / sb_secret_ must never appear in client code: it bypasses RLS and ships to the browser.',
    },
    {
      selector: `TemplateElement[value.raw=/service_role|sb_secret_/]`,
      message:
        'service_role / sb_secret_ must never appear in client code: it bypasses RLS and ships to the browser.',
    },
    {
      selector: `MemberExpression[property.name=/SERVICE_ROLE|SB_SECRET/i]`,
      message: 'Reading a service_role / secret key in client code. That value has no safe use here.',
    },
    {
      selector: `Property[key.name=/SERVICE_ROLE|SB_SECRET/i]`,
      message: 'A service_role / secret key must not be configured in a client package.',
    },
  ],
};

/**
 * Compose several `no-restricted-syntax` rule sets into ONE array: take the
 * severity once and every set's selectors after it.
 */
export function composeRestrictedSyntax(...ruleSets) {
  return {
    'no-restricted-syntax': [
      'error',
      ...ruleSets.flatMap((set) => set['no-restricted-syntax'].slice(1)),
    ],
  };
}

/**
 * The client-secret guard as a standalone entry. It re-states the RTL guard too,
 * because `base` already defines `no-restricted-syntax` and the last one wins.
 */
export const clientSecrets = [
  {
    name: '@rop/client-secrets',
    rules: composeRestrictedSyntax(rtlGuardRules, clientSecretRules),
  },
];

/** Base: typescript-eslint recommended + repo tweaks + RTL guard. */
export const base = [
  ...tseslint.configs.recommended,
  {
    name: '@rop/base',
    rules: {
      ...rtlGuardRules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    name: '@rop/ignores',
    // `*.timestamp-*.mjs`: vite/vitest write a temp copy of their config next to it
    // and delete it once loaded; a concurrent `eslint .` can glob it and then fail.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/*.timestamp-*.mjs',
      '**/*.gen.ts',
    ],
  },
];

/** React add-on: hooks rules (apps/operator). */
export const react = [
  {
    name: '@rop/react',
    files: ['**/*.{jsx,tsx}', '**/*.{js,ts}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

export default base;
