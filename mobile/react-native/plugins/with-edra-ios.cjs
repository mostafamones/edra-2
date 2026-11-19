const { cpSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const plist = require('@expo/plist').default;
const { IOSConfig, withFinalizedMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

module.exports = function withEdraIOS(config) {
  config = withInfoPlist(config, (config) => {
    delete config.modResults.NSAppTransportSecurity;
    return config;
  });

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { projectName } = config.modRequest;
    const { target } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      target.buildConfigurationList,
    );
    for (const [, configuration] of configurations) {
      if (configuration.name === 'Debug') {
        configuration.buildSettings.INFOPLIST_FILE = `"${projectName}/Info-Debug.plist"`;
      }
    }
    return config;
  });

  // Start from the finished Expo plist so Debug inherits camera, schemes and other plugin settings.
  return withFinalizedMod(config, ['ios', (config) => {
    const { projectRoot } = config.modRequest;
    const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
    const infoPath = join(sourceRoot, 'Info.plist');
    const releasePlist = plist.parse(readFileSync(infoPath, 'utf8'));
    const swiftDebugPlist = plist.parse(
      readFileSync(join(projectRoot, '../Configuration/Info-Debug.plist'), 'utf8'),
    );
    const debugPlist = {
      ...releasePlist,
      NSAppTransportSecurity: {
        ...swiftDebugPlist.NSAppTransportSecurity,
        NSAllowsLocalNetworking: true, // Metro discovery. AppConfiguration checks the exact API host.
      },
    };
    writeFileSync(join(sourceRoot, 'Info-Debug.plist'), plist.build(debugPlist));

    delete releasePlist.NSBonjourServices;
    delete releasePlist.NSLocalNetworkUsageDescription;
    writeFileSync(infoPath, plist.build(releasePlist));

    // The native camera controls and SwiftUI menu items load the Swift app's template Hugeicons from Bundle.main.
    const swiftIcons = join(projectRoot, '../EdraInstructor/Resources/Assets.xcassets/Icons');
    for (const name of readdirSync(swiftIcons).filter((entry) => entry.endsWith('.imageset'))) {
      cpSync(join(swiftIcons, name), join(sourceRoot, 'Images.xcassets', name), { recursive: true });
    }
    return config;
  }]);
};
