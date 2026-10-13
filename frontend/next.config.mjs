/**
 * One codebase, two independent outputs:
 *
 *   npm run build            → ./out, a static site. With no NEXT_PUBLIC_API_URL
 *                              it is fully self-contained (bundled catalogue +
 *                              local engine), which is what the Android build
 *                              wraps and what GitHub Pages serves.
 *   NEXT_PUBLIC_API_URL=...  → the same site, talking to a deployed FastAPI
 *                              server, with the local engine as fallback.
 *
 * NEXT_BASE_PATH is for serving under a sub-path (GitHub Pages project sites).
 * The Android build must leave it empty: Capacitor serves from the root.
 */
const basePath = process.env.NEXT_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "",
    NEXT_PUBLIC_BUILD_TARGET: process.env.NEXT_PUBLIC_BUILD_TARGET || "web",
  },
};

export default nextConfig;
