import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@verevia/ui", "@verevia/types"],
};

export default nextConfig;
