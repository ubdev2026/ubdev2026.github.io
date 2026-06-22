// next.config.js
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  async headers() {
    return [
      {
        source: "/(.*)", // Apply to all routes
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value:
              "https://*.unlibets.com https://*.ubtma.com https://ubtma.com", // Allow only iframe source
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type",
          },
          {
            key: "X-Frame-Options",
            value:
              "ALLOW-FROM https://*.unlibets.pro https://*.unlibets.com https://*.sabongworld.com https://web.telegram.org https://*.unlibets.app https://*.unlibets.online https://*.unlibets.site https://ubtma.com https://*.ubtma.com",
          },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://*.unlibets.pro https://*.unlibets.com https://*.sabongworld.com",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
