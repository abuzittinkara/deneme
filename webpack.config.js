// webpack.config.js
const path = require('path');

const mediasoupConfig = {
  mode: 'production',
  // Giriş (entry) => node_modules/mediasoup-client/lib/index.js
  entry: path.resolve(__dirname, 'node_modules', 'mediasoup-client', 'lib', 'index.js'),

  // Çıkış (output) => public/libs/mediasoup-client.min.js
  output: {
    path: path.resolve(__dirname, 'public', 'libs'),
    filename: 'mediasoup-client.min.js',

    // Burada eklediğimiz ayarlar:
    // library: 'mediasoupClient' => "mediasoupClient" isminde global değişken yaratır
    // libraryTarget: 'window'    => Bu global değişkeni window.mediasoupClient olarak ekler
    library: 'mediasoupClient',
    libraryTarget: 'window'
  }
};

const clientBundleConfig = {
  mode: 'production',
  // script.js, which pulls in all modules under public/js
  entry: path.resolve(__dirname, 'public', 'script.js'),
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      }
    ]
  }
};

module.exports = [mediasoupConfig, clientBundleConfig];
