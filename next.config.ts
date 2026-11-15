import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  devIndicators: false,
  outputFileTracingIncludes: { "/**": ["./datos/**", "./config/**", "./public/historia/indice.json", "./public/historia/pais.json"] },
};

export default config;
