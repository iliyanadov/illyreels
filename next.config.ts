import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.tikwm.com' },
      { protocol: 'https', hostname: '**.tiktokcdn.com' },
      { protocol: 'https', hostname: '**.tiktokv.com' },
      { protocol: 'https', hostname: '**.tiktokcdn-us.com' },
    ],
  },
};

export default nextConfig;
