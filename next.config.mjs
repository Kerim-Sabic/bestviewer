/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    parallelServerBuildTraces: false,
    parallelServerCompiles: false,
    webpackBuildWorker: false
  },
  transpilePackages: ["@horalix/dicom-engine"],
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false
    };
    return config;
  }
};

export default nextConfig;
