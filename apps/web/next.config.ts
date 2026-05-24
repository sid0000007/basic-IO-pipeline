import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output bundles only the runtime files Next + transitively-imported
  // packages need, producing a ~80MB image instead of shipping the full
  // node_modules tree. Required by the Dockerfile's runtime stage.
  output: 'standalone',
};

export default nextConfig;
