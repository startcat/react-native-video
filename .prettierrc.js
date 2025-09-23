module.exports = {
  semi: true,
  trailingComma: "es5",
  singleQuote: false, // Usando comillas dobles para coincidir con VS Code
  printWidth: 100,
  tabWidth: 4,
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
        tabWidth: 4,
        useTabs: true,
      },
    },
    {
      files: "*.json",
      options: {
        parser: "json",
        tabWidth: 2,
      },
    },
    {
      files: "*.md",
      options: {
        parser: "markdown",
        printWidth: 80,
        tabWidth: 2,
      },
    },
  ],
};
