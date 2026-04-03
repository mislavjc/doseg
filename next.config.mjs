/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  allowedDevOrigins: ["doseg.test"],
  experimental: {
    serverComponentsHmrCache: false,
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
