const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// 👇 Add support for Hermes + Firebase module exports
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;