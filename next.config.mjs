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
    ]
  },
}

export default nextConfig
