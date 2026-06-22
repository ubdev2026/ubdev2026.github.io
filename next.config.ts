import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out", // This is the default export directory
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
