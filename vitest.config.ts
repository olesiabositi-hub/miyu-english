import { defineConfig } from 'vitest/config';
import courses from './build/lessons-plugin';
export default defineConfig({ plugins: [courses()], test: { environment: 'node', include: ['tests/**/*.test.ts'] } });
