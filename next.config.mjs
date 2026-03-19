/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  async rewrites() {
    return [
      {
        source: "/otp/:path*",
        destination: `${process.env.OTP_URL || "http://localhost:8080"}/otp/:path*`,
      },
      {
        source: "/api/isochrone",
        destination: `${process.env.ISOCHRONE_URL || "http://localhost:3001"}/api/isochrone`,
      },
    ]
  },
}

export default nextConfig
