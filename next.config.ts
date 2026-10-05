import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E runs its own dev server with a separate dist dir so it never fights
  // a developer's `npm run dev` over the `.next` lock.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The contract workspace ships TypeScript source, not a build.
  transpilePackages: ["@todo-cat/contract"],
};

export default nextConfig;
