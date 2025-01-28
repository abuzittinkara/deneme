// webpack.config.js
const path = require('path');

module.exports = {
  mode: 'production',
  entry: path.resolve(__dirname, 'node_modules', 'mediasoup-client', 'lib', 'index.js'),
  output: {
    path: path.resolve(__dirname, 'public', 'libs'),
    filename: 'mediasoup-client.min.js'
  }
};
