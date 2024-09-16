import { z } from 'zod'

import type { Config } from './config'

export class ConcurrencyLock {
	private readonly lockDir: string
	private readonly lockFile: string
	private readonly concurrency: number

	constructor(name: string, cfg: Config, concurrency = 4) {
		z.string()
			.regex(/^[a-z\d_-]+$/i)
			.parse(name)
		this.lockDir = `${cfg.lockDir}/concurrency/${name}`
		this.lockFile = `${this.lockDir}/${crypto.randomUUID()}.lock`
		this.concurrency = concurrency
	}

	async acquire() {
		return
		await $`mkdir -p ${this.lockDir}`
		if (await Bun.file(this.lockFile).exists()) {
			throw new Error(`Lock file already exists: ${this.lockFile}`)
		}
		// Make sure we only run up to 4 concurrent uploads
		const lockCount = async () =>
			z.coerce.number().parse((await $`find ${this.lockDir} -type f|wc -l`.text()).trim())
		while ((await lockCount()) >= this.concurrency) {
			await sleep(250 + 250 * Math.random())
		}
		await Bun.write(this.lockFile, 'lock')
		echo(`new lockCount: ${await lockCount()}`)
	}

	async release() {
		return
		await $`rm ${this.lockFile}`
	}
}
