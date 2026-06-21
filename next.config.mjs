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
  async rewrites() {
    return [
      {
        source: "/otp/:path*",
        destination: `${process.env.OTP_URL || "http://localhost:8080"}/otp/:path*`,
      },
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
