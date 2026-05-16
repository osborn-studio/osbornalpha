/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
};

export default nextConfig;
