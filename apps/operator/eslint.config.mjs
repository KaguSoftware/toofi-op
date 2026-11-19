import { base, react, clientSecrets } from '@rop/config/eslint';

export default [
  ...base, // typescript-eslint recommended + the RTL logical-property guard
  ...react, // react-hooks
  ...clientSecrets, // service_role / sb_secret_ must never reach the renderer
  {
    name: '@rop/operator',
    rules: {
      // Everything the main process owns crosses the typed bridge (src/lib/bridge.ts).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'Renderer code must go through src/lib/bridge.ts.' },
            { name: 'fs', message: 'No filesystem in the renderer.' },
            { name: 'node:fs', message: 'No filesystem in the renderer.' },
          ],
        },
      ],
    },
  },
  { ignores: ['dist/**', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.mjs'] },
];
