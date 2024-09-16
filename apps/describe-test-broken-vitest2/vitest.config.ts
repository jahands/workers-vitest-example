import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: `${__dirname}/wrangler.toml` },
				main: './src/index.ts',
				miniflare: {
					bindings: {
						ENVIRONMENT: 'VITEST',
						API_TOKEN: 'password',
					},
				},
			},
		},
	},
})
