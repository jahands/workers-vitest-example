import type { Context } from 'hono'
import type { APIError } from '../helpers/errors'
import type { HonoApp } from '../types'

/** Handles typical notFound hooks */
export function useNotFound<T extends HonoApp>() {
	return async (c: Context<T>): Promise<Response> => {
		return c.json(notFoundResponse, 404)
	}
}

export const notFoundResponse = {
	success: false,
	error: { message: 'not found' },
} satisfies APIError
