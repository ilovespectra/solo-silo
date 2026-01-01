import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: false,
  webpack: (config, { isServer }) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/backend/**', '**/node_modules/**'],
    };
    return config;
  },
  serverExternalPackages: ['backend'],
  turbopack: {},
  skipMiddlewareUrlNormalize: true,
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
