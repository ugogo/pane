import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react({
      // React Compiler (auto-memoization). React 19 ships the runtime it
      // needs; no separate react-compiler-runtime package required.
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  // PostCSS pipeline (Tailwind v4) lives here so there's no standalone
  // postcss.config.js — config stays in TypeScript.
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it's already in use
    strictPort: true,
    port: 1420,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Pane targets the Windows WebView2 runtime (modern Chromium) only.
    // chrome110+ covers the ES2023 array methods (e.g. Array.toSorted) we use.
    target: 'chrome110',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
