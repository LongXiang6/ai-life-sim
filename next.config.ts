import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.236.5.229', '26.44.88.195', '127.0.0.1', '0.0.0.0', 'localhost', '::1'],
  devIndicators: false,
  serverExternalPackages: ['better-sqlite3'],
  /** 开发态：layout 首屏不预编译 MOD bootstrap 懒加载块 */
  experimental: {
    optimizePackageImports: ['zod', 'zustand'],
  },
};

export default nextConfig;
