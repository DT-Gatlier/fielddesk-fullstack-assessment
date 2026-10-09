import config from '@fielddesk/eslint-config/nest';

export default [
  ...config,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
];
