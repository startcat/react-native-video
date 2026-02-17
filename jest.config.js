module.exports = {
	testMatch: [
		"<rootDir>/src/**/__tests__/**/*.test.ts",
		"<rootDir>/src/**/__tests__/**/*.test.tsx",
	],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
	transform: {
		"^.+\\.tsx?$": [
			"babel-jest",
			{
				presets: ["@babel/preset-typescript"],
				plugins: ["@babel/plugin-transform-modules-commonjs"],
			},
		],
	},
	transformIgnorePatterns: ["node_modules/(?!(eventemitter3)/)"],
	testEnvironment: "node",
	globals: {
		__DEV__: true,
	},
	collectCoverage: false,
};
