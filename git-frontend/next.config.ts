import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["iqlabs-sdk"],
  serverExternalPackages: ["ws"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      crypto: false, 
    };
    return config;
  },
};

export default nextConfig;
