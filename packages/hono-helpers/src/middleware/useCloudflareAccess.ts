import { seconds } from 'itty-time'
import { z } from 'zod'

import { newHTTPException } from '../helpers/errors'

import type { Context, Next } from 'hono'
import type { HonoApp } from '../types'

export function useCloudflareAccess({
	team,
	audience,
}: {
	team: AccessTeam
	audience: AccessAudience
}) {
	const accessTeamDomain = AccessTeamDomain.parse(
		`https://${AccessTeam.parse(team)}.cloudflareaccess.com`
	)
	const accessAud = AccessAudience.parse(audience)

	return async (c: Context<HonoApp>, next: Next): Promise<void> => {
		if (!hasValidJWT(c.req.raw)) {
			throw newHTTPException(401, 'unauthorized')
		}

		try {
			await validateAccessJWT({ request: c.req.raw, accessTeamDomain, accessAud })
		} catch (e) {
			c.var.logger?.warn(`validateAccessJWT failed ${e instanceof Error ? e.message : 'unknown'}`, {
				error: e,
			})
			c.var.sentry?.captureException(e)
			throw newHTTPException(401, 'unauthorized')
		}

		await next()
	}
}

// Access validation code adapted from:
// https://github.com/cloudflare/pages-plugins/blob/main/packages/cloudflare-access/functions/_middleware.ts?at=90281ad52b77506bb7723a8db813e19723725509#L88

function extractJWTFromRequest(req: Request): AccessJWT {
	return AccessJWT.parse(req.headers.get('Cf-Access-Jwt-Assertion'))
}

function includesAud(payload: AccessPayload, aud: string): boolean {
	if (typeof payload.aud === 'string') {
		return payload.aud === aud
	}
	return payload.aud.includes(aud)
}

function hasValidJWT(req: Request): boolean {
	try {
		extractJWTFromRequest(req)
		return true
	} catch {
		return false
	}
}

// Adapted slightly from https://github.com/cloudflare/workers-access-external-auth-example
function base64URLDecode(s: string): Uint8Array {
	s = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
	return new Uint8Array(Array.from(atob(s)).map((c: string) => c.charCodeAt(0)))
}

function asciiToUint8Array(s: string): Uint8Array {
	const chars = []
	for (let i = 0; i < s.length; ++i) {
		chars.push(s.charCodeAt(i))
	}
	return new Uint8Array(chars)
}

async function validateAccessJWT({
	request,
	accessTeamDomain,
	accessAud,
}: {
	request: Request
	accessTeamDomain: AccessTeamDomain
	accessAud: AccessAudience
}): Promise<{ jwt: string; payload: object }> {
	const jwt = extractJWTFromRequest(request)

	const parts = jwt.split('.')
	if (parts.length !== 3) {
		throw new Error('JWT does not have three parts.')
	}
	const [header, payload, signature] = parts

	const textDecoder = new TextDecoder('utf-8')
	const { kid } = AccessHeader.parse(JSON.parse(textDecoder.decode(base64URLDecode(header))))
	const certsURL = new URL('/cdn-cgi/access/certs', accessTeamDomain)
	const certsResponse = await fetch(certsURL.toString(), {
		cf: {
			cacheEverything: true,
			cacheTtl: seconds('1 day'),
		},
	})
	const { keys } = AccessCertsResponse.parse(await certsResponse.json())
	const jwk = keys.find((key) => key.kid === kid)
	if (!jwk) {
		throw new Error('Could not find matching signing key.')
	}

	const key = await crypto.subtle.importKey(
		'jwk',
		jwk,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['verify']
	)

	const unroundedSecondsSinceEpoch = Date.now() / 1000

	const payloadObj = AccessPayload.parse(JSON.parse(textDecoder.decode(base64URLDecode(payload))))

	if (payloadObj.iss !== certsURL.origin) {
		throw new Error('JWT issuer is incorrect.')
	}
	if (!includesAud(payloadObj, accessAud)) {
		throw new Error('JWT audience is incorrect.')
	}
	if (Math.floor(unroundedSecondsSinceEpoch) >= payloadObj.exp) {
		throw new Error('JWT has expired.')
	}
	// nbf is only present for users, not service auth
	if (payloadObj.identity_nonce && Math.ceil(unroundedSecondsSinceEpoch) < payloadObj.nbf) {
		throw new Error('JWT is not yet valid.')
	}

	const verified = await crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		key,
		base64URLDecode(signature),
		asciiToUint8Array(`${header}.${payload}`)
	)
	if (!verified) {
		throw new Error('Could not verify JWT.')
	}

	return { jwt, payload: payloadObj }
}

// ============= TYPES ============= //
const accessJWTRegex = /^[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i

type AccessJWT = z.infer<typeof AccessJWT>
const AccessJWT = z.string().regex(accessJWTRegex)

type AccessTeam = z.infer<typeof AccessTeam>
const AccessTeam = z.string().regex(/^[a-z0-9-]+$/)

type AccessTeamDomain = z.infer<typeof AccessTeamDomain>
const AccessTeamDomain = z.string().regex(/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/)

type AccessKid = z.infer<typeof AccessKid>
const AccessKid = z.string().regex(/^[a-f0-9]{64}$/)

type AccessAudience = z.infer<typeof AccessAudience>
const AccessAudience = z.string().regex(/^[a-f0-9]{64}$/)

type AccessAlgorithm = z.infer<typeof AccessAlgorithm>
const AccessAlgorithm = z.literal('RS256', { message: 'unknown algorithm' })

type AccessHeader = z.infer<typeof AccessHeader>
const AccessHeader = z.object({
	kid: AccessKid,
	alg: AccessAlgorithm,
	typ: z.literal('JWT').optional(),
})

type AccessKey = z.infer<typeof AccessKey>
const AccessKey = z.object({
	kid: AccessKid,
	kty: z.literal('RSA', { message: 'unknown key type' }),
	alg: AccessAlgorithm,
	use: z.string().min(1),
	e: z.string().min(1),
	n: z.string().min(1),
})

type PublicCERT = z.infer<typeof PublicCERT>
const PublicCERT = z.object({
	kid: AccessKid,
	cert: z
		.string()
		.min(1)
		.refine(
			(c) => c.includes('-----BEGIN CERTIFICATE-----') && c.includes('-----END CERTIFICATE-----'),
			{ message: 'invalid cert format - missing or invalid header/footer' }
		),
})

type AccessCertsResponse = z.infer<typeof AccessCertsResponse>
const AccessCertsResponse = z.object({
	keys: z.array(AccessKey).min(1, { message: 'Could not fetch signing keys.' }),
	public_cert: PublicCERT,
	public_certs: z.array(PublicCERT).min(1, { message: 'Could not fetch public certs.' }),
})

// JWT fields are documented here: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/

const AccessPayloadCommon = z.object({
	type: z.enum(['app', 'org']),
	exp: z.number().min(1),
	iat: z.number().min(1),
	iss: AccessTeamDomain,
})

const ServiceAuthAccessPayload = AccessPayloadCommon.extend({
	aud: AccessAudience,
	common_name: z.string().regex(/^[a-f0-9]{32}\.access$/),
	sub: z.literal(''),
	identity_nonce: z.undefined().describe('no identity for service auth'),
})

const UserAccessPayload = AccessPayloadCommon.extend({
	aud: z.array(AccessAudience),
	nbf: z.number().min(1).describe('nbf is required on user keys'),
	email: z
		.string()
		.min(1)
		.refine((e) => e.includes('@')),
	identity_nonce: z.string().min(1).describe('users must have identity nonce'),
	sub: z.string().uuid().describe('uuid of the user in Cloudflare Access'),
	country: z.string().length(2),
})

type AccessPayload = z.infer<typeof AccessPayload>
const AccessPayload = z.union([UserAccessPayload, ServiceAuthAccessPayload])
