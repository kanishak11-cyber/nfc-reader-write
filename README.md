# NFC Read Write

An Expo (React Native) app for iOS and Android that reads and writes NFC tags.

- **Read**: the tag's serial number (UID), type, technologies, storage used and capacity, whether it's locked, and every NDEF record, decoded. Supported records are text, links, phone, email, SMS, location, Wi-Fi, contact cards, smart posters, Android app records and raw MIME data. Links can be opened, values copied, and raw bytes shown.
- **Write**: a link, text, phone number, email, or Wi-Fi network. The app shows the size in bytes before you write, checks it against the tag's capacity, and formats blank tags on Android. **Erase** writes an empty NDEF message.

Built on [`react-native-nfc-manager`](https://github.com/revtel/react-native-nfc-manager) v4 and Expo Router native tabs (SDK 58).

## Running it

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

### iOS via TestFlight (EAS)

The project is linked to EAS project `@kanishak11-cyber/nfc-reader-write`. One command builds in the cloud and uploads to App Store Connect:

```sh
npx eas-cli@latest build --platform ios --profile production --auto-submit
```

The first time, it asks you to sign in to your Apple Developer account (paid membership required). It then sets up the following automatically:
- the distribution certificate and provisioning profile
- the `com.nfcreaderwrite.app` App ID, with the **NFC Tag Reading** capability enabled
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
src/app/_layout.tsx        Native tab bar (Read, Write)
src/app/index.tsx          Read screen
src/app/write.tsx          Write screen
src/lib/nfc.ts             NFC sessions: availability, read, write, erase, errors
src/lib/ndef.ts            NDEF decode/encode (text, URI, Wi-Fi WSC, vCard, smart poster…)
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
