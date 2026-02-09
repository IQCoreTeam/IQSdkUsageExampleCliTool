import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@iqlabs-official/solana-sdk"],
  serverExternalPackages: ["ws", "@solana/web3.js"],
  outputFileTracingRoot: __dirname,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
