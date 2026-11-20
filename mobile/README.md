# Edra Instructor

The Expo React Native app in [react-native](react-native/README.md) is the instructor companion for iOS and Android. The setup guide covers public configuration, installing a development build on an iPhone, running Metro, and building with an embedded bundle.

The former standalone SwiftUI app is available at Git commit `52b03dc2`. To build that reference without changing the current checkout, run from the repository root:

```sh
git worktree add --detach ../edra-swiftui-reference 52b03dc2
```

Follow `mobile/README.md` in the reference checkout for its Xcode setup. The current app keeps its iOS auth, Keychain, camera and platform controls under `react-native/`.
