import type { NextConfig } from "next";

const repoName = "UATO";
const isProduction = process.env.NODE_ENV === "production";
const isFirebaseDeployment = process.env.FIREBASE_DEPLOY === "true";
const useGitHubPagesBasePath = isProduction && !isFirebaseDeployment;

const nextConfig: NextConfig = {
  output: "export",
  basePath: useGitHubPagesBasePath ? `/${repoName}` : "",
  assetPrefix: useGitHubPagesBasePath ? `/${repoName}/` : "",
  images: {
    unoptimized: true
  },
  trailingSlash: true
};

export default nextConfig;
