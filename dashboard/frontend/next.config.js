/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  ...(isProd && { output: 'export' }),
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    return isProd
      ? []
      : [{ source: '/api/dashboard/:path*', destination: 'http://localhost:8000/api/dashboard/:path*' }]
  },
}
