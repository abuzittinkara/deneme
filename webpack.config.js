const path = require('path');

module.exports = {
  mode: 'development', // Üretim için 'production' olarak ayarlayabilirsiniz.
  entry: path.resolve(__dirname, 'client', 'src', 'index.js'),
  output: {
    path: path.resolve(__dirname, 'public', 'js'),
    filename: 'bundle.js',
    publicPath: '/js/'
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  devtool: 'source-map'
};
