import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
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
      '*.config.js',
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
      // Correctness rules stay as errors.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // React-Compiler heuristics surface as warnings rather than hard errors:
      // they flag valid existing patterns (e.g. a mount-time fetch in an effect)
      // and shouldn't block commits. Tighten to 'error' as components are migrated.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // Node-side tooling scripts (build/format helpers).
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Turn off rules that conflict with Prettier; must come last.
  prettier,
);
