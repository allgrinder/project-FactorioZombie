import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Weltaufbau-Tests legen ganze Orte an; unter Last (viele Worker) brauchen sie länger als 5 s
    testTimeout: 30000,
  },
});
