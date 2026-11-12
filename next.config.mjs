/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint still has a backlog of style errors (mostly no-explicit-any), so
  // it doesn't gate the build. Run `npm run lint` to see them.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Type errors DO fail the build: the codebase type-checks clean, and a
  // broken type is far cheaper to catch here than in production.
  typescript: {
    ignoreBuildErrors: false,
  },
  // sqlite3 is a native addon; keep it out of the server bundle.
  serverExternalPackages: ["sqlite3"],
};

export default nextConfig;
