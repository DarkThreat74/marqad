/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the AudioWorklet processor and service worker to be served as
  // static assets from the public/ directory with correct MIME types.
  // Next.js already serves public/ files at root — no special config needed
  // for .js files, but we set headers for service worker scope correctness.
  async headers() {
    return [
      {
        // Service worker must never be cached — browser needs to see the
        // latest version to trigger an update
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/audio-worklet-processor.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // Next.js chunks have hashed filenames so they're safe to cache.
        // But the HTML page that references them must not be cached,
        // otherwise the browser loads old HTML pointing to old chunks.
        source: "/((?!_next/static/).*)",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
