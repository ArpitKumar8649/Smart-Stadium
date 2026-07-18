import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@concourse/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
      'virtual:pwa-register': fileURLToPath(new URL('./src/test/pwaRegisterMock.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage/frontend',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.d.ts',
        // Renderer-heavy visual surfaces are verified through data-transform tests,
        // mocked component tests, and Playwright flows rather than brittle jsdom pixels.
        'src/components/trophy/**',
        'src/features/concierge/StadiumMap3D.tsx',
      ],
      thresholds: {
        statements: 80,
        branches: 72,
        functions: 78,
        lines: 80,
      },
    },
  },
});
