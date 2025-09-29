/** @type {import('next').NextConfig} */
const nextConfig = {
  // skip ESLint during `next build`
  eslint: {
    ignoreDuringBuilds: true,
  },
  // skip TypeScript type-checking during `next build`
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
