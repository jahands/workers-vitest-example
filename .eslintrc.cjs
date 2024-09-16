// This configuration only applies to the package manager root.
/** @type {import("eslint").Linter.Config} */
module.exports = {
	ignorePatterns: ['apps/**', 'apps2/**', 'packages/**', 'bunapps/**'],
	extends: ['@repo/eslint-config/workers.cjs'],
	overrides: [
		{
			files: 'turbo/generators/**/*.ts',
			rules: {
				'@typescript-eslint/ban-ts-comment': 'off',
				'@typescript-eslint/no-explicit-any': 'off',
			},
		},
	],
}
