import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  rewrites: async () => {
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';
    return {
      beforeFiles: [
        // Rewrite all /api requests to the backend
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
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
