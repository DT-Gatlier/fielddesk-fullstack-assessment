import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import base from './base.js';

export default [
  ...base,
  ...nextVitals,
  ...nextTypescript,
  prettier,
  { ignores: ['next-env.d.ts'] },
];
