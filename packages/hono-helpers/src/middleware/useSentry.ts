import { HTTPException } from 'hono/http-exception'

import { validateEnv } from '../helpers/env'

import type { Context, Next } from 'hono'
import type { Toucan } from 'toucan-js'
import type { HonoApp } from '../types'

/** Adds sentry for environment 'production'
 * Typically, this should be added early in the middleware chain
 */
export function useSentry<T extends HonoApp>(
	initSentry: (request: Request, env: T['Bindings'], ctx: ExecutionContext) => Toucan,
	transactionOp: string
) {
	return async (c: Context<T>, next: Next): Promise<void> => {
		if (c.env.ENVIRONMENT === 'production') {
			validateEnv([
				[c.env.SENTRY_DSN, 'stringMin1', 'SENTRY_DSN'],
				[c.env.SENTRY_RELEASE, 'stringMin1', 'SENTRY_RELEASE'],
			])

			// @ts-expect-error Hono is missing a method in executionCtx
			const sentry = initSentry(c.req.raw, c.env, c.executionCtx)
			const tx = sentry.startTransaction({ name: c.req.path, op: transactionOp })
			sentry.configureScope((scope) => {
				scope.setSpan(tx)
				scope.setTag('invocationId', c.get('invocationId'))
			})
			tx.setTag('invocationId', c.get('invocationId'))

			c.set('sentry', sentry)
			c.set('tx', tx)
		}
		c.set('txWaitUntil', [])

		await next()

		c.get('tx')?.setName(c.req.routePath)

		const skipTxStatuses = [401, 403, 404]
		let recordTx = true
		if (c.error instanceof HTTPException && skipTxStatuses.includes(c.error.status)) {
			// Don't record transactions for auth errors or not found
			recordTx = false
		}
		if (skipTxStatuses.includes(c.res.status)) {
			recordTx = false
		}
		if (recordTx) {
			const waitAndCommitTX = async (): Promise<void> => {
				await Promise.allSettled(c.get('txWaitUntil') ?? [])
				c.get('tx')?.finish()
			}
			c.executionCtx.waitUntil(waitAndCommitTX())
		} else {
			c.executionCtx.waitUntil(Promise.allSettled(c.get('txWaitUntil') ?? []))
		}
	}
}
