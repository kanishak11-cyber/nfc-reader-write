# NFC Read Write

[![Latest release](https://img.shields.io/github/v/release/kanishak11-cyber/nfc-reader-write)](https://github.com/kanishak11-cyber/nfc-reader-write/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platforms: iOS | Android](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-lightgrey)
![Expo SDK 58](https://img.shields.io/badge/Expo%20SDK-58-000020)

An open-source Expo (React Native) app for iOS and Android that reads and writes NFC tags. It's free to use, modify and redistribute under the [MIT License](LICENSE).

- **Read**: the tag's serial number (UID), type, technologies, storage used and capacity, whether it's locked, and every NDEF record, decoded. Supported records are text, links, phone, email, SMS, location, Wi-Fi, contact cards, smart posters, Android app records and raw MIME data. Links can be opened, values copied, and raw bytes shown.
- **Write**: a link, text, phone number, email, or Wi-Fi network. The app shows the size in bytes before you write, checks it against the tag's capacity, and formats blank tags on Android. **Erase** writes an empty NDEF message.
- **Diagnose**: explains why a tag can't be written or erased. It reads the chip's own settings:
  - **NTAG21x / MIFARE Ultralight**: exact chip model, permanent lock bits, the read-only flag, password protection (start page, read protection, attempt limit) and configuration lock.
  - **NTAG 424 DNA**: which AES key guards writing and changing permissions, and whether SUN dynamic URLs are on. An opt-in **Test factory key** button checks whether the vendor left NXP's default key in place, which decides whether the card can be reset.
  - **MIFARE Classic, DESFire and ISO 15693 tags**: identifies the type and explains what controls access.

  Diagnose only reads; it never writes to the tag.

Built on [`react-native-nfc-manager`](https://github.com/revtel/react-native-nfc-manager) v4 and Expo Router native tabs (SDK 58).

## Download

**Android:** [**Download the latest APK**](https://github.com/kanishak11-cyber/nfc-reader-write/releases/latest). Open the `.apk` on your phone, allow installs from unknown sources if asked, and turn on NFC. The release notes list a SHA-256 checksum for each APK.

**iOS:** Apple doesn't allow installing apps from a file. Build it yourself with the steps under [Running it](#running-it).

## Running it

```sh
git clone https://github.com/kanishak11-cyber/nfc-reader-write.git
cd nfc-reader-write
npm install
```

NFC needs native code, so this app **does not run in Expo Go**, and **simulators and emulators have no NFC**. Use a development build on a real phone.

### Android

1. Turn on USB debugging on the phone and plug it in (`adb devices` should list it).
2. `npx expo run:android --device`

### iOS

1. Change `ios.bundleIdentifier` in `app.json` to one you own, e.g. `com.yourname.nfc`.
2. You need a **paid Apple Developer account**. Free accounts can't use the NFC Tag Reading capability.
3. Plug in the iPhone, then run `npx expo run:ios --device` and pick your team when Xcode asks.

After the first build, `npm start` runs the dev server and JS changes reload instantly. Rebuild only after changing native dependencies or `app.json` plugins.

## Test builds

### Android APK (local, no account needed)

```sh
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk   # or copy it to the phone
```

The release APK has the JavaScript bundled in, so it runs without a dev server. It's signed with the debug keystore, which is fine for sideloading but not for the Play Store.

### Using your own accounts (forks)

`app.json` and `eas.json` point at the maintainer's Expo project and App Store Connect app. To build and publish under your own accounts:

1. Change `ios.bundleIdentifier` and `android.package` in `app.json` to IDs you own, e.g. `com.yourname.nfc`.
2. Delete `owner` and `extra.eas.projectId` from `app.json`, then run `npx eas-cli@latest init` to link the app to your Expo account.
3. Delete `submit.production.ios.ascAppId` from `eas.json`. EAS creates your App Store Connect app on the first submit.

You don't need any of this for local builds (`npx expo run:android` / `run:ios`, or the APK steps above).

### iOS via TestFlight (EAS)

One command builds in the cloud and uploads to App Store Connect:

```sh
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

The first time, it asks you to sign in to your Apple Developer account (paid membership required). It then sets up the following automatically:
- the distribution certificate and provisioning profile
- the App ID for your bundle identifier, with the **NFC Tag Reading** capability enabled
- the App Store Connect app record

Build numbers increase on their own (`appVersionSource: remote`). When processing finishes (about 10–30 min after upload), add yourself as an internal tester in App Store Connect → TestFlight and install from the TestFlight app.

> **NFC entitlement:** the app requests only the `TAG` reader-session format (`includeNdefEntitlement: false` in `app.json`). With the iOS 27 SDK, App Store Connect rejects the `NDEF` format (ITMS-90778). The app still reads and writes NDEF, through tag sessions (`requestTechnology`). Don't use `registerTagEvent` on iOS: it starts an NDEF-only session, which needs the rejected format.

Other profiles in `eas.json`: `development` (dev client) and `preview` (internal ad hoc build, APK on Android).

## Releasing

`scripts/release.mjs` bumps the version, builds the iOS app on EAS (auto-submitted to TestFlight), and exports the Android release APK:

```sh
npm run release:patch                 # 1.0.0 → 1.0.1
npm run release:minor                 # 1.0.0 → 1.1.0
npm run release:major                 # 1.0.0 → 2.0.0
npm run release -- none               # rebuild the current version
npm run release -- patch --dry-run    # preview without changing anything
```

A run does the following:
1. Refuses to start if there are uncommitted changes, or if the tag already exists.
2. Runs the typecheck and lint.
3. Writes the new version to `app.json` and `package.json`. It also sets the Android `versionCode` to `major*10000 + minor*100 + patch` (so 1.2.3 becomes 10203), which means each APK installs over the last one.
4. Commits `chore(release): vX.Y.Z` and tags `vX.Y.Z`. Nothing is pushed; run `git push --follow-tags` when you're ready.
5. Starts the iOS production build on EAS with TestFlight auto-submit. EAS raises the iOS build number itself.
6. Regenerates the Android project, builds the release APK, and saves it as `releases/vX.Y.Z/nfc-read-write-vX.Y.Z-<versionCode>.apk`, printing its SHA-256.

Options: `--ios` / `--android` (build one platform only), `--no-submit`, `--wait` (stay until the EAS build finishes), `--install` (`adb install -r` the APK), `--no-git`, `--allow-dirty`, `--skip-checks`. Run `npm run release -- --help` for details.

## Platform differences

| | iOS | Android |
|---|---|---|
| Scan UI | System "Ready to Scan" sheet | In-app sheet with Cancel |
| Wi-Fi tags | Can write, but iPhones won't join from them | Tapping the tag offers to join |
| Blank, unformatted tags | Can't format them | Formatted automatically on first write |
| ATQA/SAK, tech list | Not exposed | Shown |

## Project layout

```
src/app/_layout.tsx        Native tab bar (Read, Write, Diagnose)
src/app/index.tsx          Read screen
src/app/write.tsx          Write screen
src/app/diagnose.tsx       Diagnose screen
src/lib/nfc.ts             NFC sessions: availability, read, write, erase, errors
src/lib/ndef.ts            NDEF decode/encode (text, URI, Wi-Fi WSC, vCard, smart poster…)
src/lib/chips.ts           Chip identification, lock/password/permission analysis, NTAG 424 auth (pure, testable)
src/lib/diagnose.ts        Diagnose sessions: raw NFC-A / ISO-DEP commands, factory-key test
src/components/            UI building blocks, record card, Android scan sheet
```

## Scripts

```sh
npm start          # dev server for the development build
npm run android    # build + install on Android
npm run ios        # build + install on iOS
npm run lint
npm run typecheck
```

## Contributing

Issues and pull requests are welcome. Before opening a PR:

- Run `npm run typecheck` and `npm run lint`.
- If you change NFC behaviour, test it on a real device, and say in the PR which phone and tag type you used (e.g. iPhone 15 + NTAG215). Emulators can't scan tags.
- Keep `ios/` and `android/` out of commits. They're generated by `npx expo prebuild` from `app.json`.

Bugs and feature requests go in [GitHub Issues](https://github.com/kanishak11-cyber/nfc-reader-write/issues).

## License

[MIT](LICENSE) © 2026 Kanishak Chaurasia. You can use, copy, modify, merge, publish, distribute, sublicense and sell copies of this software, as long as the copyright and license notice are included. The software is provided "as is", without warranty.

Third-party libraries keep their own licenses. The main ones are [Expo](https://github.com/expo/expo) (MIT), [React Native](https://github.com/facebook/react-native) (MIT) and [react-native-nfc-manager](https://github.com/revtel/react-native-nfc-manager) (MIT).
