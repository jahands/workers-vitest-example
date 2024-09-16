import { z } from 'zod'

import { getRepoRoot } from './path'

export async function getConfig() {
	const repoRoot = await getRepoRoot()
	const lockDir = `${repoRoot}/.sentryclirc.lock`
	await $`mkdir -p ${lockDir}`
	const version = (await $`bun run get-version`.text()).trim()
	return Config.parse({ repoRoot, lockDir, version } satisfies Config)
}

export type Config = z.infer<typeof Config>
export const Config = z.object({
	repoRoot: z.string().startsWith('/').min(2),
	lockDir: z.string(),
	version: z
		.string()
		.regex(/^\d{4}\.\d{2}\.\d{2}-[\da-f]{7,8}$/)
		.describe('unexpected version format'),
})
