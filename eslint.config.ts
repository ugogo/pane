import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import youMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';
import reactDoctor from 'eslint-plugin-react-doctor';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  // Ignore build output and generated/vendored trees.
  {
    ignores: [
      'dist/',
      'node_modules/',
      'src-tauri/',
      'assets/',
      '.claude/',
      '*.config.{js,ts}',
    ],
  },

  // Base JS + TypeScript recommended rules.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Frontend source: React + browser globals.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // React-Compiler heuristics: enforced as errors now that the codebase
      // has been migrated off the patterns they flag.
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/static-components': 'error',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // "You might not need an effect" — flags effects that should be derived
  // values, event handlers, or external-store subscriptions instead.
  youMightNotNeedAnEffect.configs.recommended,

  // React Doctor — correctness/performance/a11y/security rule set (oxc-based).
  {
    ...reactDoctor.configs.recommended,
    files: ['src/**/*.{ts,tsx}'],
  },

  // Node-side tooling scripts (build/format helpers).
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Turn off rules that conflict with Prettier; must come last.
  prettier,
);
