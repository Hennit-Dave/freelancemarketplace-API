/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // There is no landing page; send visitors at the root to the consumer page.
  async redirects() {
    return [{ source: '/', destination: '/consumer', permanent: false }];
  },
};
export default nextConfig;
