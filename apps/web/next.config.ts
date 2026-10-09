import type { NextConfig } from 'next';
import { validateApiUrl } from './src/lib/env';

validateApiUrl(process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = {};

export default nextConfig;
