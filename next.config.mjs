import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  // Ensure a single Yjs instance (avoids "Yjs was already imported" when HMR/y-indexeddb
  // would otherwise resolve a second copy). See https://github.com/yjs/yjs/issues/438
  transpilePackages: ["yjs", "y-indexeddb", "y-websocket", "lib0"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      yjs: require.resolve("yjs"),
    };
    return config;
  },
};

export default nextConfig;
