import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  rewrites: async () => {
    return {
      beforeFiles: [
        // Do NOT rewrite system endpoints - let them use Next.js handlers
        {
          source: '/api/system/:path*',
          destination: '/api/system/:path*',
        },
        // Rewrite all other /api requests to the backend
        {
          source: '/api/:path*',
          destination: 'http://127.0.0.1:8000/api/:path*',
        },
      ],
    };
  },
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
