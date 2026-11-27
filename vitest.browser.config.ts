import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {include: ['tests/browser/*.browser.ts'], hookTimeout: 30_000},
});
