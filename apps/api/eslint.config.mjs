import nestConfig from '@fielddesk/eslint-config/nest';

export default [
  ...nestConfig,
  {
    files: ['**/*.ts'],
    rules: {
      curly: ['error', 'all'],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
];
