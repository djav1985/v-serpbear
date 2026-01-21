/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  // Performance optimizations
  experimental: {
    optimizePackageImports: ['react-icons', 'react-chartjs-2', 'react-query']
  },

  // Compiler optimizations
  compiler: {
    // Preserve server logging by default; opt-in via NEXT_REMOVE_CONSOLE
    removeConsole:
      process.env.NEXT_REMOVE_CONSOLE === 'true'
        ? {
            exclude: ['error']
          }
        : false
  },

  // Bundle analyzer (enable with ANALYZE=true)
  ...(process.env.ANALYZE === 'true' && {
    webpack: (config, { dev, isServer, defaultLoaders: _defaultLoaders, nextRuntime: _nextRuntime, webpack: _webpack }) => {
      if (!dev && !isServer) {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: 'bundle-analyzer-report.html',
            openAnalyzer: false
          })
        );
      }
      return config;
    }
  }),

  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384]
  },

  // Webpack optimizations
  webpack: (config, { dev, isServer: _isServer, defaultLoaders: _defaultLoaders, nextRuntime: _nextRuntime, webpack: _webpack }) => {
    // Bundle size optimizations
    if (!dev) {
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10
        },
        common: {
          name: 'common',
          minChunks: 2,
          chunks: 'all',
          priority: 5
        }
      };
    }

    return config;
  }
};

module.exports = nextConfig;
