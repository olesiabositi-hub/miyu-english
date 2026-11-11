import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import lessons from './build/lessons-plugin';

// base './' keeps assets working both on english.miyu.academy and on <user>.github.io/miyu-english/
export default defineConfig({
  base: './',
  plugins: [lessons()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        learn: resolve(__dirname, 'learn/index.html'),
      },
    },
  },
  test: { environment: 'jsdom' },
} as any);
