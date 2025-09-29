// eslint.config.js (Flat)
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importX from 'eslint-plugin-import-x'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Ignorer les dossiers générés
  globalIgnores(['dist', 'build', 'coverage', '.vite', '.turbo']),

  // Code applicatif (TS/TSX)
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      // Règles TS aware (type-checked)
      ...tseslint.configs.recommendedTypeChecked,
      // Optionnel, ajoute des règles de style TS (toujours type-checked)
      ...tseslint.configs.stylisticTypeChecked,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    plugins: {
      'jsx-a11y': jsxA11y,
      'import-x': importX,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        // active la vérif de type sans galérer avec les chemins
        project: true,           // auto-détection tsconfig
        tsconfigRootDir: process.cwd(),
      },
      globals: {
        ...globals.browser,
        // Vite expose ces globals en dev/test parfois
        __DEV__: 'readonly',
      },
    },
    rules: {
      // a11y
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/no-autofocus': 'warn',

      // React Hooks (déjà dans extends, mais en "error")
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Imports (ordre, doublons, non résolus)
      'import-x/first': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/no-unresolved': ['error', { ignore: ['^@/'] }], // si tu as un alias @/
      'import-x/order': ['warn', {
        'newlines-between': 'always',
        groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
        alphabetize: { order: 'asc', caseInsensitive: true },
      }],

      // Garde-fous
      'no-debugger': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // TypeScript : quelques règles utiles en prod
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
    },
    settings: {
      // aide import-x à résoudre TS path aliases
      'import-x/resolver': {
        typescript: true,
        node: true,
      },
    },
  },

  // Fichiers de config / scripts Node (JS/TS)
  {
    files: [
      '**/*.{js,cjs,mjs}',
      '**/*.{config,conf}.{js,cjs,mjs,ts}',
      'vite.config.*',
      'eslint.config.*',
      'tsup.config.*',
      'tailwind.config.*',
      'postcss.config.*',
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
])
