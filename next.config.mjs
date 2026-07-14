/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  allowedDevOrigins: ["doseg.test"],
  experimental: {
    serverComponentsHmrCache: false,
    // Per-icon resolution so the ~2000-export icon barrel doesn't pull its
    // whole module graph into dev compiles / the bundle.
    optimizePackageImports: [
      "@central-icons-react/square-outlined-radius-0-stroke-2",
    ],
  },
  async redirects() {
    // The interactive map moved from / to /karta; shared map links carry
    // ?lat (origin) or ?dlat (destination) — send both to the new home.
    // Unlisted query params pass through to the destination automatically.
    return [
      {
        source: "/",
        has: [{ type: "query", key: "lat" }],
        destination: "/karta",
        permanent: true,
      },
      {
        source: "/",
        has: [{ type: "query", key: "dlat" }],
        destination: "/karta",
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: "/api/isochrone",
        destination: `${process.env.ISOCHRONE_URL || "http://localhost:3002"}/api/isochrone`,
      },
      {
        source: "/api/rt/:path*",
        destination: `${process.env.ISOCHRONE_URL || "http://localhost:3002"}/api/rt/:path*`,
      },
    ]
  },
}

export default nextConfig
