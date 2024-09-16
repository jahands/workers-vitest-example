// @ts-check
/** @type {import("syncpack").RcFile} */
const config = {
	indent: '\t',
	lintFormatting: false, // handled by prettier
	// dependencyTypes: ['prod'], // disabled filter to enable all types
	versionGroups: [
		{
			label: 'local packages',
			packages: ['**'],
			dependencies: ['@repo/*'],
			dependencyTypes: ['!local'], // Exclude the local package itself
			pinVersion: 'workspace:*',
		},
		{
			label: 'Sentry types that are compatible with toucan-js',
			dependencies: ['@sentry/types', '@sentry/tracing'],
			pinVersion: '7.76.0',
		},
		{
			label: 'toucan-js that is compatible with pinned sentry types',
			dependencies: ['toucan-js'],
			pinVersion: '3.3.1',
		},
		{
			dependencies: ['vitest', '@vitest/ui'],
			isIgnored: true, // Want to test various vitest versions
		},
		{
			label: 'pin opentelemetry to match otel-cf-workers',
			dependencies: ['@opentelemetry/api'],
			pinVersion: '1.6.0',
		},
		{
			label: 'pin otel-cf-workers',
			dependencies: ['@microlabs/otel-cf-workers'],
			pinVersion: '1.0.0-rc.40',
		},
		{
			label: 'pin hono due to breaking change',
			dependencies: ['hono'],
			pinVersion: '4.4.13',
		},
	],
	semverGroups: [
		{
			label: 'pin all deps',
			range: '',
			dependencies: ['**'],
			packages: ['**'],
		},
	],
}

module.exports = config
