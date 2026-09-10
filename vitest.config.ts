import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './shared',
          include: ['src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'server',
          root: './server',
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
