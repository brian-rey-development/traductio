import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/'] },
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'max-lines-per-function': ['error', { max: 20, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
);
