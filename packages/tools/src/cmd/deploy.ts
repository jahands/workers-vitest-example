import { Command } from '@commander-js/extra-typings'

import { getConfig } from '../config'
import { ConcurrencyLock } from '../lock'

export const deployCmd = new Command('deploy').description('Deploy Workers/Pages/etc.')

deployCmd
	.command('wrangler')
	.description('Deploy a Workers project with Wrangler')
	.action(async () => {
		const cfg = await getConfig()
		echo(chalk.blue(`Sentry version: ${cfg.version}`))
		const lock = new ConcurrencyLock('wrangler-deploy', cfg, 6)
		try {
			await lock.acquire()
			$.verbose = true
			await $`rm -rf ./dist` // Make sure we don't have any previous artifacts
			await retry(
				3,
				'1s',
				() =>
					$`wrangler deploy --minify --upload-source-maps --outdir ./dist --var SENTRY_RELEASE:${cfg.version}`
			)
		} finally {
			await lock.release()
		}
	})

deployCmd
	.command('pages')
	.description(
		'Deploy a Pages project using Wrangler. Note: may need tweeking to work with non-Remix projects.'
	)
	.argument('<project>', 'Pages project name to deploy', (p) => p)
	.action(async (project) => {
		const cfg = await getConfig()
		echo(chalk.blue(`Sentry version: ${cfg.version}`))
		const lock = new ConcurrencyLock('wrangler-deploy', cfg, 6)
		try {
			await lock.acquire()
			$.verbose = true
			await retry(
				3,
				'1s',
				() => $`wrangler pages deploy ./build/client --commit-dirty=true --project-name ${project}`
			)
		} finally {
			await lock.release()
		}
	})
