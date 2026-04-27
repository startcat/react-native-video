/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	testPathIgnorePatterns: ['/node_modules/', '/examples/', '/dist/', '/lib/'],
	moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: '<rootDir>/tsconfig.json',
				// `warnOnly: true` keeps tests runnable while the codebase still has
				// pre-existing TypeScript errors in unrelated files (e.g. menu.ts,
				// castMessage.ts, source.ts at the time of this branch's base
				// commit). New code under test should still be type-correct; if you
				// introduce a regression here, the build (`yarn build`) is the
				// authoritative gate.
				diagnostics: { warnOnly: true },
			},
		],
	},
};
