# NFC Doctor

[![Latest release](https://img.shields.io/github/v/release/kanishak11-cyber/nfc-reader-write)](https://github.com/kanishak11-cyber/nfc-reader-write/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platforms: iOS | Android](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-lightgrey)
![Expo SDK 58](https://img.shields.io/badge/Expo%20SDK-58-000020)

An open-source Expo (React Native) app for iOS and Android that reads and writes NFC tags. It's free to use, modify and redistribute under the [MIT License](LICENSE).

- **Read**: the tag's serial number (UID), type, technologies, storage used and capacity, whether it's locked, and every NDEF record, decoded. Supported records are text, links, phone, email, SMS, location, Wi-Fi, contact cards, smart posters, Android app records and raw MIME data. Links can be opened, values copied, and raw bytes shown.
- **Write**: a link, text, phone number, email, or Wi-Fi network. The app shows the size in bytes before you write, checks it against the tag's capacity, and formats blank tags first: NTAG, MIFARE Ultralight and ISO 15693 (ICODE) tags on iPhone and Android, and MIFARE DESFire EV1+ cards on Android. When a tag can't be written on this phone, the error says why and which phone can handle it. **Erase** writes an empty NDEF message.
- **Tag password**: lock an NTAG21x or MIFARE Ultralight EV1 tag with its built-in 32-bit password so nobody else can overwrite or erase it, and optionally can't read it. Enter the password to write, erase or unlock the tag later. It stops casual tampering; it isn't strong encryption, and a forgotten password can't be recovered.
- **Secure NTAG 424 DNA cards**: replace the card's factory key with an AES-128 key derived from a passphrase and the card's serial number, and set it so anyone can read but only that key can write. No server and no stored keys: the key is rebuilt from the passphrase each time. Enter the passphrase to write, erase or unlock the card later. SUN dynamic URLs stay off because they need a server to verify.
- **History**: every read, write, erase, lock and diagnosis is saved on the phone, newest first, with filters. Open an entry to copy its content or write it again. Tag contents are kept; tag passwords, card passphrases, keys and Wi-Fi passwords never are.
- **Diagnose**: explains why a tag can't be written or erased. It reads the chip's own settings:
  - **NTAG21x / MIFARE Ultralight**: exact chip model, permanent lock bits, the read-only flag, password protection (start page, read protection, attempt limit) and configuration lock.
  - **NTAG 424 DNA**: which AES key guards writing and changing permissions, and whether SUN dynamic URLs are on. An opt-in **Test factory key** button checks whether the vendor left NXP's default key in place.
  - **MIFARE DESFire**: blank cards that can be formatted, and what controls access on the rest.
  - **ISO 15693 (ICODE), FeliCa and MIFARE Classic**: identifies the type and maker, whether it's formatted and writable, and whether this phone can talk to it at all.

  Diagnosing and testing the factory key only read the tag; they never write to it.
- **Reset NTAG 424 DNA cards**: if the key that controls permissions is still the factory key, **Reset card** restores the NDEF file to factory settings and erases the old link. Afterwards SUN is off, anyone can read and write, and key 0 controls permission changes, so the card works like a new blank tag. The reset is an encrypted, signed ChangeFileSettings command (AuthenticateEV2First and CommMode.Full, per NXP AN12196), and the card rejects it if anything doesn't verify. Keys aren't changed.

## Supported tags

| Tag | iPhone | Android |
|---|---|---|
| **NTAG213 / 215 / 216** | ✅ Read, write, diagnose. Blank tags are formatted | ✅ Same |
| **MIFARE Ultralight** (EV1, C, original) | ✅ Read, write, diagnose. Blank tags are formatted (older chips need a second tap the first time) | ✅ Same |
| **NTAG 424 DNA** | ✅ Read, write, diagnose, factory-key reset | ✅ Same |
| **ICODE / ISO 15693** | ✅ Read, write. Blank tags are formatted; tags holding other data (library or shipping labels) are left alone | ✅ Same |
| **MIFARE DESFire** (EV1, EV2, EV3) | ⚠️ Read and write once formatted. Format a blank card once on Android, then it works on iPhone | ✅ Read, write. Blank cards are formatted |
| **FeliCa** | ⚠️ Read and write FeliCa Lite-S tags that are already NDEF formatted | ⚠️ Same |
| **MIFARE Classic** | ❌ iPhones can't detect it | ⚠️ Only on phones with an NXP NFC chip, with factory keys or already formatted |

No phone can format a blank FeliCa tag, or a card locked by its issuer's keys. The Diagnose tab shows this list for the phone you're using.

Built on [`react-native-nfc-manager`](https://github.com/revtel/react-native-nfc-manager) v4 and Expo Router (SDK 58). The interface follows the TapClay design system: a Home hub with Read, Write, History, Erase, Protect and Diagnose, clay surfaces on lavender with a dark Midnight theme, and Plus Jakarta Sans.

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

The build number comes from `app.json` (`appVersionSource: local`) and matches the Android `versionCode`, so 1.2.3 is build 10203 everywhere. Bump the version before each upload, because TestFlight accepts each build number once. When processing finishes (about 10–30 min after upload), add yourself as an internal tester in App Store Connect → TestFlight and install from the TestFlight app.

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
3. Writes the new version to `app.json` and `package.json`. It also sets one build number, `major*10000 + minor*100 + patch` (so 1.2.3 becomes 10203), as both the Android `versionCode` and the iOS `buildNumber`. The version and build number are then the same on both platforms, in the git tag and in the APK name, and each release installs over the last one.
4. Commits `chore(release): vX.Y.Z` and tags `vX.Y.Z`. Nothing is pushed; run `git push --follow-tags` when you're ready.
5. Starts the iOS production build on EAS with TestFlight auto-submit, using the version and build number from `app.json`.
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
