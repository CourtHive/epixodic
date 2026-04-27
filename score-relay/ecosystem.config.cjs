module.exports = {
  apps: [
    {
      name: 'Score-Relay',
      script: 'dist/server.js',
      env: { NODE_ENV: 'production' },
      watch: false,
    },
  ],
};
