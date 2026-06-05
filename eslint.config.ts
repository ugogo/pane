import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import youMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect';
import reactDoctor from 'eslint-plugin-react-doctor';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** Desktop (Metro web) and Expo companion React sources. */
const reactSourceFiles = [
  'apps/windows/app/**/*.{ts,tsx}',
  'apps/windows/src/**/*.{ts,tsx}',
  'apps/mobile/**/*.{ts,tsx}',
];

export default tseslint.config(
  // Ignore build output and generated/vendored trees.
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      'apps/mobile/**/.expo/',
      'apps/**/*.config.{js,ts}',
      'apps/windows/tauri/',
      'assets/',
      '.claude/',
      '*.config.{js,ts}',
      'packages/ui/**/*.cjs',
      'apps/windows/.tamagui/',
      'apps/windows/app/tamagui.generated.css',
    ],
  },

  // Base JS + TypeScript recommended rules.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Desktop app: React + browser globals + fast refresh.
  {
    files: ['apps/windows/app/**/*.{ts,tsx}', 'apps/windows/src/**/*.{ts,tsx}'],
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

  // Expo companion: same React hooks rules; fetch/timer globals from browser set.
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/static-components': 'error',
      // PanResponder and similar RN APIs use ref-backed stable handlers.
      'react-hooks/refs': 'off',
    },
  },

  // "You might not need an effect" — flags effects that should be derived
  // values, event handlers, or external-store subscriptions instead.
  youMightNotNeedAnEffect.configs.recommended,

  // React Doctor — desktop (includes React Compiler heuristics).
  {
    ...reactDoctor.configs.recommended,
    files: ['apps/windows/app/**/*.{ts,tsx}', 'apps/windows/src/**/*.{ts,tsx}'],
  },

  // React Doctor — Expo companion (recommended + react-native preset).
  {
    ...reactDoctor.configs.recommended,
    ...reactDoctor.configs['react-native'],
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      ...reactDoctor.configs.recommended.rules,
      ...reactDoctor.configs['react-native'].rules,
      // Expo Go does not run the React Compiler; useCallback is still useful.
      'react-doctor/react-compiler-no-manual-memoization': 'off',
      // Control screen state is readable as separate hooks; reducer adds noise here.
      'react-doctor/prefer-useReducer': 'off',
    },
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
