import nextPlugin from '@next/eslint-plugin-next';
import { base, react, clientSecrets } from '@rop/config/eslint';

export default [
  ...base, // typescript-eslint recommended + the RTL logical-property guard
  ...react, // react-hooks
  ...clientSecrets, // service_role / sb_secret_ must never reach the guest's browser
  {
    name: '@rop/menu/next',
    plugins: { '@next/next': nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs['core-web-vitals'].rules },
  },
  {
    name: '@rop/menu',
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              importNames: ['createClient'],
              message: 'Only src/lib/server/supabase.ts talks to Supabase: the browser never does.',
            },
          ],
        },
      ],
    },
  },
  { name: '@rop/menu/supabase-factory', files: ['src/lib/server/supabase.ts'], rules: { 'no-restricted-imports': 'off' } },
  { ignores: ['.next/**', 'next-env.d.ts', 'eslint.config.mjs', 'vitest.config.ts'] },
];
