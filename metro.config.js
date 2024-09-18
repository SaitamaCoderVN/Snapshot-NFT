const { getDefaultConfig } = require('expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.resolver.extraNodeModules = {
  stream: require.resolve('readable-stream'),
  crypto: require.resolve('react-native-crypto'),
  https: require.resolve('https-browserify'),
  http: require.resolve('stream-http'),
  url: require.resolve('url/'),
  buffer: require.resolve('buffer/'),
  process: require.resolve('process/browser'),
  'safe-buffer': require.resolve('safe-buffer'),
  'text-encoding': require.resolve('text-encoding'),
};

module.exports = defaultConfig;