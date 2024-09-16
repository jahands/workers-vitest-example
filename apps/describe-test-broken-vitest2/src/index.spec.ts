import { SELF } from 'cloudflare:test'
import { describe, expect, it, test } from 'vitest'

describe('some tests', () => {
	describe('more specifically', () => {
		it('does a test', async () => {
			const res = await SELF.fetch('https://example.com/')
			expect(res.status).toBe(200)
			expect(await res.text()).toMatchInlineSnapshot(`"hello, world!"`)
		})
	})
})
