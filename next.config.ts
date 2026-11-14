import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  outputFileTracingIncludes: { "/**": ["./datos/**", "./config/**"] },
};

export default config;
