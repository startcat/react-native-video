module.exports = {
  semi: true,
  trailingComma: 'es5',
  singleQuote: false, // Usando comillas dobles para coincidir con VS Code
  printWidth: 100,
  tabWidth: 2, // Cambiado a 2 espacios (estándar para TS/React)
  useTabs: false,
  bracketSpacing: true,
  arrowParens: 'avoid',
  endOfLine: 'auto',
  // Removido parser global - se define en overrides
  // React Native specific overrides
  overrides: [
    {
      files: '*.{js,jsx,ts,tsx}',
      options: {
        parser: 'typescript',
        tabWidth: 2,
      },
    },
    {
      files: '*.json',
      options: {
        parser: 'json',
        tabWidth: 2,
      },
    },
    {
      files: '*.md',
      options: {
        parser: 'markdown',
        printWidth: 80,
        tabWidth: 2,
      },
    },
  ],
};
