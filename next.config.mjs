/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the AudioWorklet processor and service worker to be served as
  // static assets from the public/ directory with correct MIME types.
  // Next.js already serves public/ files at root — no special config needed
  // for .js files, but we set headers for service worker scope correctness.
  async headers() {
    return [
      {
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
        ],
      },
    ];
  },
};

export default nextConfig;
