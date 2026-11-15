const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/*
 * Store screenshots only: NFC_MOCK=1 swaps the NFC library for a simulated tag so the real
 * app runs on simulators and emulators, which have no NFC. See "Store screenshots" in the
 * README. Never set it for a build you ship.
 */
if (process.env.NFC_MOCK === '1') {
  const mock = path.join(__dirname, 'scripts/screenshots/nfc-mock.js');
  const resolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'react-native-nfc-manager' && context.originModulePath !== mock) {
      return { type: 'sourceFile', filePath: mock };
    }
    return (resolve ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
