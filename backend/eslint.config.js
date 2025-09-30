// eslint.config.js (Backend - Node.js)
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  // Ignore generated files and build output
  { ignores: ['dist', 'node_modules', 'coverage', 'prisma/generated'] },

  // Base JavaScript config
  js.configs.recommended,

  // TypeScript configuration for Node.js
  ...tseslint.config({
    files: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/__tests__/**/*.ts', 'src/**/*.spec.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Node.js specific rules
      'no-console': 'off', // Allow console in Node.js
      'no-debugger': 'error',

      // TypeScript rules
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/array-type': ['warn', { default: 'array-simple' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }),

  // Configuration files (JavaScript)
  {
    files: ['*.config.js', '*.config.mjs', 'eslint.config.js'],
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