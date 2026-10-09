import nextEnv from '@next/env';
import openapiTS, { astToString } from 'openapi-typescript';
import { writeFile } from 'node:fs/promises';

nextEnv.loadEnvConfig(process.cwd());
const raw = process.env.NEXT_PUBLIC_API_URL;
if (!raw)
  throw new Error('Set NEXT_PUBLIC_API_URL; codegen requires a running API.');
const url = new URL(raw);
if (
  !['http:', 'https:'].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.pathname !== '/' ||
  url.search ||
  url.hash
) {
  throw new Error('NEXT_PUBLIC_API_URL must be an HTTP(S) origin');
}
const schema = await openapiTS(new URL('/docs-json', url));
await writeFile('src/api/schema.d.ts', astToString(schema));
console.log('Generated FieldDesk API types from /docs-json.');
