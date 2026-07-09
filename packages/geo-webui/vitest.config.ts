import { defineConfig } from 'vitest/config';
import { URL } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			'@y4nn777/geo-workspace': new URL('../geo-workspace/src/index.ts', import.meta.url).pathname,
			'@y4nn777/geo-tools': new URL('../geo-tools/src/index.ts', import.meta.url).pathname,
		},
	},
	test: {
		include: ['test/**/*.test.ts'],
	},
});
