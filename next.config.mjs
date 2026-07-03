/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Ignore the archived static demo
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/legacy-demo/**'] };
    return config;
  },
  async redirects() {
    return [{ source: '/dashboard', destination: '/today', permanent: true }];
  },
};

export default nextConfig;
