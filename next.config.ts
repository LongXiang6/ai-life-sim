import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['10.236.5.229'],
  devIndicators: false,
  /** 开发态：layout 首屏不预编译 MOD bootstrap 懒加载块 */
  experimental: {
    optimizePackageImports: ['zod', 'zustand'],
  },
};

export default nextConfig;
