const path = require("path");

/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ["iqlabs-sdk"],
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, os: false };
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana/web3.js": path.resolve(__dirname, "node_modules/@solana/web3.js"),
      "@coral-xyz/anchor": path.resolve(__dirname, "node_modules/@coral-xyz/anchor"),
      "@noble/hashes": path.resolve(__dirname, "node_modules/@noble/hashes"),
    };
    return config;
  },
};
