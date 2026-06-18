import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'release/',
        'electron/',
        'python/',
        'scripts/',
      ],
    },
    resolveSnapshotPath: (testPath, extension) => {
      return path.join(path.dirname(testPath), '__snapshots__', path.basename(testPath) + extension);
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});