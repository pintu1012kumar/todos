// next.config.js

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Only apply this rule to the client-side build
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // The 'canvas' module is a server-side dependency.
        // We tell Webpack to ignore it when building for the browser.
        canvas: false,
      };
    }
    return config;
  },
};

export default nextConfig;