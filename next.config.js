/** @type {import('next').NextConfig} */
const appBuildId = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.NEXT_PUBLIC_APP_BUILD_ID
  || 'local';

const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_APP_BUILD_ID: appBuildId },
};

module.exports = nextConfig;
