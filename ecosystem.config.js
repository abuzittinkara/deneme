/**
 * PM2 ecosystem configuration
 *
 * The Node server spawns mediasoup workers on startup.
 */
module.exports = {
  apps: [
    {
      name: 'fisqos-server',
      script: './server.js',
      // mediasoup workers are created inside server.js
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
