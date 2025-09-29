// eslint.config.js (Flat Config for Frontend)
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default [
  // Ignorer les dossiers générés
  { ignores: ['dist', 'build', 'coverage', '.vite', '.turbo', 'node_modules'] },

  // Base JS config
  js.configs.recommended,

  // TypeScript and React config for app files
  ...tseslint.config({
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __DEV__: 'readonly',
      },
    },
    rules: {
      // React Hooks
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'warn',

      // React Refresh
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // Garde-fous
      'no-debugger': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // TypeScript
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
    },
  }),

  // Fichiers de config
  {
    files: [
      '**/*.{js,cjs,mjs}',
      '**/*.config.{js,cjs,mjs,ts}',
      'vite.config.*',
      'eslint.config.*',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
]