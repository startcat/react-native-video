module.exports = {
	semi: true,
	trailingComma: "es5",
	singleQuote: false, // Usando comillas dobles para coincidir con VS Code
	printWidth: 100,
	tabWidth: 4, // Cambiado a 2 espacios (estándar para TS/React)
	useTabs: true,
	bracketSpacing: true,
	arrowParens: "avoid",
	endOfLine: "auto",
	// Removido parser global - se define en overrides
	// React Native specific overrides
	overrides: [
		{
			files: "*.{js,jsx,ts,tsx}",
			options: {
				parser: "typescript",
				useTabs: true,
				tabWidth: 4,
			},
		},
		{
			files: "*.json",
			options: {
				parser: "json",
				useTabs: true,
				tabWidth: 4,
				trailingComma: "none",
			},
		},
		{
			files: "*.eslintrc",
			options: {
				parser: "json",
				useTabs: true,
				tabWidth: 4,
				trailingComma: "none",
			},
		},
		{
			files: "*.md",
			options: {
				parser: "markdown",
				printWidth: 80,
				useTabs: true,
				tabWidth: 4,
			},
		},
	],
};
