import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Rewrite barrel imports of these heavy client libraries to direct paths so
    // only the used icons/components ship — smaller bundles, faster cold builds.
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  // The vendored @devdigest/shared barrel is NodeNext source: its relative
  // imports say `./contracts/x.js` but the files are `.ts`. Runtime (non-type)
  // imports bundle it, so webpack must map `.js` specifiers to `.ts` too.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
