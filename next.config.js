/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  // Performance optimizations
  experimental: {
    optimizePackageImports: ['react-chartjs-2', 'react-query'],
  },

  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
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
  webpack: (config, { isServer: _isServer, defaultLoaders: _defaultLoaders, nextRuntime: _nextRuntime, webpack: _webpack }) => {
    // Exclude unused Sequelize dialect dependencies
    // Handle externals safely whether it's an array, function, or undefined
    const existingExternals = Array.isArray(config.externals) ? config.externals : [];
    config.externals = [
      ...existingExternals,
      {
        'pg-hstore': 'commonjs pg-hstore',
      }
    ];

    return config;
  }
};

module.exports = nextConfig;
