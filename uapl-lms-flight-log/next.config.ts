import type { NextConfig } from "next";

const repoName = "UATO";
const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProduction ? `/${repoName}` : "",
  assetPrefix: isProduction ? `/${repoName}/` : "",
  images: {
    unoptimized: true
  },
  trailingSlash: true
};

export default nextConfig;
