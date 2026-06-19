/** @type {import('next').NextConfig} */
const nextConfig = {
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
