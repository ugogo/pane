import { fileURLToPath, URL } from 'node:url';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    target: 'es2022',
  },
  clearScreen: false,
  define: {
    __DEV__: JSON.stringify(mode !== 'production'),
    'process.env.NODE_ENV': JSON.stringify(
      mode === 'production' ? 'production' : 'development',
    ),
  },
  plugins: [
    TanStackRouterVite({
      generatedRouteTree: './src/routeTree.gen.ts',
      routesDirectory: './src/routes',
      target: 'react',
    }),
    reactCompilerPreset(),
    react(),
  ],
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
      {
        find: /^react-native$/,
        replacement: 'react-native-web',
      },
      {
        find: /^@react-native-community\/slider$/,
        replacement: fileURLToPath(
          new URL('./src/shims/native-slider.tsx', import.meta.url),
        ),
      },
      {
        find: /^react-native-svg$/,
        replacement: fileURLToPath(
          new URL('./src/shims/react-native-svg.tsx', import.meta.url),
        ),
      },
    ],
  },
  server: {
    port: 8081,
    strictPort: true,
  },
}));
