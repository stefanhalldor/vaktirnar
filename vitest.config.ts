import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // server-only is a Next.js runtime guard that throws outside RSC.
      // In the vitest environment it is safe to stub as a no-op.
      'server-only': path.resolve(__dirname, 'lib/__tests__/__mocks__/server-only.ts'),
    },
  },
});
