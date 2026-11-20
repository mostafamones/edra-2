const { cpSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const plist = require('@expo/plist').default;
const { IOSConfig, withFinalizedMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');
const { boldSvg } = require('../src/platform/chrome/icons/stroke.cjs');

// The SwiftUI app's Debug exception (mones.ddns.net). AppConfiguration allows HTTP only to these exact hosts.
const debugExceptionDomains = {
  'mones.ddns.net': { NSExceptionAllowsInsecureHTTPLoads: true },
};

/** `keepSigningTeam`: write `ios.appleTeamId` into the project (upgrade identity) instead of leaving it to Expo CLI. */
module.exports = function withEdraIOS(config, { keepSigningTeam = false } = {}) {
  config = withInfoPlist(config, (config) => {
    delete config.modResults.NSAppTransportSecurity;
    return config;
  });

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { projectName } = config.modRequest;
    const { uuid, target } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      target.buildConfigurationList,
    );
    for (const [, configuration] of configurations) {
      if (configuration.name === 'Debug') {
        configuration.buildSettings.INFOPLIST_FILE = `"${projectName}/Info-Debug.plist"`;
      }
      // `expo run:ios` passes -allowProvisioningUpdates/-allowProvisioningDeviceRegistration only when it picks
      // the team itself (preferring ios.appleTeamId). A prebuilt team skips that, so a first device build of a
      // new bundle ID fails with "No profiles for ... were found".
      if (!keepSigningTeam) delete configuration.buildSettings.DEVELOPMENT_TEAM;
      // The Swift app's global tint; `PlatformColor('AccentColor')` resolves the same colour set by name.
      configuration.buildSettings.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = 'AccentColor';
    }
    if (!keepSigningTeam) {
      for (const [, item] of Object.entries(IOSConfig.XcodeUtils.getProjectSection(project))) {
        delete item.attributes?.TargetAttributes?.[uuid]?.DevelopmentTeam;
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
    const debugPlist = {
      ...releasePlist,
      NSAppTransportSecurity: {
        NSExceptionDomains: debugExceptionDomains,
        NSAllowsLocalNetworking: true, // Metro discovery. AppConfiguration checks the exact API host.
      },
    };
    writeFileSync(join(sourceRoot, 'Info-Debug.plist'), plist.build(debugPlist));

    delete releasePlist.NSBonjourServices;
    delete releasePlist.NSLocalNetworkUsageDescription;
    writeFileSync(infoPath, plist.build(releasePlist));

    // Native menus and camera controls load these template icons from Bundle.main, plus a `-bold` copy at the
    // heavier stroke for iOS Bold Text.
    const catalog = join(sourceRoot, 'Images.xcassets');
    const icons = join(projectRoot, 'assets/hugeicons');
    for (const name of readdirSync(icons).filter((entry) => entry.endsWith('.imageset'))) {
      cpSync(join(icons, name), join(catalog, name), { recursive: true });
      const bold = join(catalog, name.replace(/\.imageset$/, '-bold.imageset'));
      cpSync(join(icons, name), bold, { recursive: true });
      for (const svg of readdirSync(bold).filter((entry) => entry.endsWith('.svg'))) {
        writeFileSync(join(bold, svg), boldSvg(readFileSync(join(bold, svg))));
      }
    }
    // Expo's template catalog has no AccentColor, so PlatformColor('AccentColor') would resolve to no colour.
    cpSync(join(projectRoot, 'assets/AccentColor.colorset'), join(catalog, 'AccentColor.colorset'), { recursive: true });
    return config;
  }]);
};
