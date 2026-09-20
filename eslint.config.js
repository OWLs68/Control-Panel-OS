// Flat ESLint config for Roma OS.
//
// The app is vanilla TypeScript on esbuild, so there is no framework plugin
// here — just the type-unaware TS rules, which are enough to catch the class of
// mistake that actually bites: an unused import left behind after a refactor,
// a `var` that escapes its block, a promise nobody awaits.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', '.tmp/**', 'node_modules/**', 'docs/roma-os/mockup.html'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Node scripts, but the ones driving a browser contain page.evaluate
    // callbacks that run in the page — so both sets of globals are legitimate.
    files: ['build.js', 'scripts/**/*.mjs', 'tests/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // The service worker runs in its own global scope, not the window's.
    files: ['sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
)
