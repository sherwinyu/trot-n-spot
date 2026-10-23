const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaultBlockList = config.resolver.blockList;

// Platform-specific env files are sourced by launch scripts. Expo's dev env
// context includes them, but its transformer cannot parse these filenames.
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList)
    ? defaultBlockList
    : defaultBlockList ? [defaultBlockList] : []),
  /[/\\]\.env\.(ios|android)(\.local)?$/,
];

module.exports = config;
