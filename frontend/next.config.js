// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config file, not part of the TS app
const path = require('path');

const nextConfig = {
  turbopack: {
    root: path.join(__dirname, '..'),
  },
};

module.exports = nextConfig;