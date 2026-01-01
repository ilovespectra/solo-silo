import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  webpack: (config, { isServer }) => {
    // Exclude backend directory from webpack processing
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/backend/**', '**/node_modules/**'],
    };
    return config;
  },
  // Exclude backend from build process entirely
  serverExternalPackages: ['backend'],
  // Enable Turbopack with empty config to avoid conflicts
  turbopack: {},
};

export default nextConfig;
