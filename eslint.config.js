import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.local/**',
      '**/dist/**',
      '**/node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.js'], languageOptions: { sourceType: 'module' } },
  {
    files: ['packages/{core,contracts}/**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:@archimesh/(?:web|server)|@azure|@fastify|fastify|kysely|pg|pg-native|react|react-dom|vite)(?:/|$)|(?:^|/)apps/(?:web|server)(?:/|$)',
              message:
                'Keep shared domain and contracts independent of UI and infrastructure.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx,js,mjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:@archimesh/server|@fastify|fastify|kysely|pg|pg-native)(?:/|$)|(?:^|/)apps/server(?:/|$)|^(?:\\.\\./)+server/src(?:/|$)',
              message:
                'Use shared contracts and the HTTP API to access backend capabilities.',
            },
          ],
        },
      ],
    },
  },
);
