#!/usr/bin/env node
/**
 * Release helper. Everything builds on this machine, so no EAS build credits are used.
 *
 *   npm run release -- <major|minor|patch|none> [options]
 *
 * 1. Bumps the version in app.json + package.json, and derives one build number
 *    from it (major*10000 + minor*100 + patch) for both the Android versionCode
 *    and the iOS buildNumber, so 1.2.3 is build 10203 on every platform and
 *    every release installs over the previous one.
 * 2. Runs the typecheck and lint.
 * 3. Commits the bump and tags it vX.Y.Z (no push).
 * 4. Android (Gradle): the release APK for sideloading (debug key, as before) and the
 *    .aab for Google Play, signed with the upload key from credentials.json.
 * 5. iOS (Xcode): archives the app and uploads it to App Store Connect for TestFlight,
 *    or exports an .ipa with --no-submit.
 * 6. With --play, uploads the local .aab to Google Play through `eas submit`
 *    (a submission, not a build, so it uses no build credits).
 *
 * Files land in releases/vX.Y.Z/.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = path.join(ROOT, 'app.json');
const PKG_JSON = path.join(ROOT, 'package.json');
const CREDENTIALS_JSON = path.join(ROOT, 'credentials.json');
const ANDROID_DIR = path.join(ROOT, 'android');
const APK_BUILT = path.join(ANDROID_DIR, 'app/build/outputs/apk/release/app-release.apk');
const AAB_BUILT = path.join(ANDROID_DIR, 'app/build/outputs/bundle/release/app-release.aab');
const IOS_DIR = path.join(ROOT, 'ios');
const IOS_BUILD_DIR = path.join(IOS_DIR, 'build');
const RELEASES_DIR = path.join(ROOT, 'releases');

const HELP = `
Usage: npm run release -- <major|minor|patch|none> [options]

Bump:
  major | minor | patch   Bump the version (1.2.3 → 2.0.0 | 1.3.0 | 1.2.4)
  none                    Rebuild the current version (no commit, no tag). TestFlight
                          and Google Play accept each build number once, so only upload
                          a rebuild if the earlier upload of this version never made it.

Options:
  --ios           Only build iOS
  --android       Only build Android (the .aab and the APK)
  --no-submit     Export the iOS .ipa to releases/ instead of uploading it to TestFlight
  --no-aab        Skip the Android .aab (APK only; no upload key needed)
  --play          Upload the .aab to Google Play with eas submit (needs the Google
                  service account key on EAS; the track comes from eas.json)
  --install       Install the APK on the connected Android device (adb install -r)
  --no-git        Don't commit or tag the version bump
  --allow-dirty   Allow running with uncommitted changes
  --skip-checks   Skip typecheck and lint
  --dry-run       Check the setup and show what would happen, without changing anything
  -h, --help      Show this help

Setup (once):
  Android .aab   credentials.json with the Play upload key. Download it from EAS:
                   npx eas-cli@latest credentials --platform android
                   → production → credentials.json → Download credentials from EAS
  iOS            Xcode signed in to your Apple team (Xcode → Settings → Accounts) and
                 ios.appleTeamId in app.json. Or use an App Store Connect API key:
                 ASC_API_KEY_PATH, ASC_API_KEY_ID, ASC_API_ISSUER_ID.
`;

/* ----------------------------------------------------------------- */

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

function step(title) {
  console.log(`\n${c.cyan('▸')} ${c.bold(title)}`);
}

function fail(message) {
  console.error(`\n${c.red('✖')} ${message}`);
  process.exit(1);
}

/** Prints a command with any secrets in it masked. */
function echo(cmd, args, secrets = []) {
  let line = [cmd, ...args].join(' ');
  for (const secret of secrets) if (secret) line = line.split(secret).join('***');
  console.log(c.dim(`  $ ${line}`));
}

function run(cmd, args, { cwd = ROOT, env = {}, capture = false, secrets = [] } = {}) {
  echo(cmd, args, secrets);
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) fail(`Could not run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) fail(`${cmd} ${args[0] ?? ''} failed (exit ${result.status}).`);
  return result.stdout ?? '';
}

/** Runs a noisy command with its output in a log file; prints the errors if it fails. */
function runLogged(cmd, args, logFile) {
  echo(cmd, args);
  const log = path.relative(ROOT, logFile);
  console.log(c.dim(`  this takes a few minutes; follow along with: tail -f ${log}`));
  mkdirSync(path.dirname(logFile), { recursive: true });
  const fd = openSync(logFile, 'w');
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  if (result.error) fail(`Could not run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) {
    const lines = readFileSync(logFile, 'utf8').trimEnd().split('\n');
    const errors = lines.filter((line) => /error:|\*\* [A-Z ]+ FAILED \*\*/.test(line));
    console.error((errors.length ? errors : lines).slice(-30).join('\n'));
    fail(`${cmd} ${args[0]} failed (exit ${result.status}). Full log: ${log}`);
  }
}

function works(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim() };
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

/* ----------------------------------------------------------------- */

function parseArgs(argv) {
  const opts = {
    bump: null,
    ios: true,
    android: true,
    submit: true,
    aab: true,
    play: false,
    install: false,
    git: true,
    allowDirty: false,
    checks: true,
    dryRun: false,
  };
  for (const arg of argv) {
    switch (arg) {
      case 'major':
      case 'minor':
      case 'patch':
      case 'none':
        opts.bump = arg;
        break;
      case '--ios':
        opts.android = false;
        break;
      case '--android':
        opts.ios = false;
        break;
      case '--no-submit':
        opts.submit = false;
        break;
      case '--no-aab':
        opts.aab = false;
        break;
      case '--play':
        opts.play = true;
        break;
      case '--install':
        opts.install = true;
        break;
      case '--no-git':
        opts.git = false;
        break;
      case '--allow-dirty':
        opts.allowDirty = true;
        break;
      case '--skip-checks':
        opts.checks = false;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '-h':
      case '--help':
        console.log(HELP);
        process.exit(0);
        break;
      default:
        fail(`Unknown argument "${arg}".\n${HELP}`);
    }
  }
  if (!opts.bump) fail(`Choose a version bump: major, minor, patch or none.\n${HELP}`);
  if (!opts.ios && !opts.android) fail('--ios and --android together leave nothing to build; pass neither to build both.');
  if (opts.install && !opts.android) fail('--install needs the Android build.');
  if (opts.play && (!opts.android || !opts.aab)) fail('--play needs the .aab build.');
  return opts;
}

function bumpVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`app.json version "${version}" is not MAJOR.MINOR.PATCH.`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') [major, minor, patch] = [major + 1, 0, 0];
  if (bump === 'minor') [minor, patch] = [minor + 1, 0];
  if (bump === 'patch') patch += 1;
  if (minor > 99 || patch > 99) fail('Minor and patch must stay below 100 to derive the Android versionCode.');
  return { version: `${major}.${minor}.${patch}`, versionCode: major * 10000 + minor * 100 + patch };
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function describeFile(file) {
  const mb = (statSync(file).size / 1024 / 1024).toFixed(1);
  console.log(`  ${path.relative(ROOT, file)} (${mb} MB)`);
  console.log(`  sha256 ${sha256(file)}`);
}

/** The Play upload key from credentials.json (the file `eas credentials` downloads). */
function readUploadKey() {
  if (!existsSync(CREDENTIALS_JSON)) return { problem: 'credentials.json is missing.' };
  let keystore;
  try {
    keystore = readJson(CREDENTIALS_JSON).android?.keystore;
  } catch (error) {
    return { problem: `credentials.json is not valid JSON (${error.message}).` };
  }
  const { keystorePath, keystorePassword, keyAlias, keyPassword } = keystore ?? {};
  if (!keystorePath || !keystorePassword || !keyAlias || !keyPassword) {
    return { problem: 'credentials.json needs android.keystore.{keystorePath,keystorePassword,keyAlias,keyPassword}.' };
  }
  const file = path.resolve(ROOT, keystorePath);
  if (!existsSync(file)) return { problem: `The keystore in credentials.json (${keystorePath}) doesn't exist.` };
  return { file, storePassword: keystorePassword, alias: keyAlias, keyPassword };
}

/** An App Store Connect API key from the environment, used instead of Xcode's signed-in account. */
function readAscKey() {
  const { ASC_API_KEY_PATH: keyPath, ASC_API_KEY_ID: id, ASC_API_ISSUER_ID: issuer } = process.env;
  if (!keyPath && !id && !issuer) return { key: null };
  if (!keyPath || !id || !issuer) return { problem: 'Set all of ASC_API_KEY_PATH, ASC_API_KEY_ID and ASC_API_ISSUER_ID, or none.' };
  const file = path.resolve(ROOT, keyPath);
  if (!existsSync(file)) return { problem: `ASC_API_KEY_PATH (${keyPath}) doesn't exist.` };
  return { key: { file, id, issuer } };
}

/** Problems that would stop a build, found before anything changes. */
function checkSetup() {
  const problems = [];
  if (opts.android) {
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    if (!sdk || !existsSync(sdk)) problems.push('Android: set ANDROID_HOME to your Android SDK (Android Studio → Settings → Android SDK).');
    if (!works('java', ['-version'])) problems.push('Android: Java is not on your PATH (install JDK 17, e.g. brew install openjdk@17).');
    if (opts.aab && uploadKey.problem) {
      problems.push(
        `Android .aab: ${uploadKey.problem} The .aab must be signed with your Play upload key.\n` +
          '    Download it from EAS once (this uses no build credits):\n' +
          '      npx eas-cli@latest credentials --platform android\n' +
          '      → production → credentials.json: Upload/Download → Download credentials from EAS to credentials.json\n' +
          '    Or pass --no-aab to build only the APK.',
      );
    }
  }
  if (opts.ios) {
    if (process.platform !== 'darwin') problems.push('iOS: building iOS needs macOS with Xcode. Pass --android to skip it.');
    else if (!works('xcodebuild', ['-version'])) problems.push('iOS: xcodebuild is not available. Install Xcode, then run: sudo xcode-select -s /Applications/Xcode.app');
    if (process.platform === 'darwin' && !works('pod', ['--version'])) problems.push('iOS: CocoaPods is missing (brew install cocoapods).');
    if (!/^[A-Z0-9]{10}$/.test(teamId ?? '')) {
      problems.push('iOS: set ios.appleTeamId in app.json to your 10-character Apple team ID (developer.apple.com → Membership).');
    }
    if (ascKey.problem) problems.push(`iOS: ${ascKey.problem}`);
  }
  return problems;
}

/* ----------------------------------------------------------------- */

const opts = parseArgs(process.argv.slice(2));
const app = readJson(APP_JSON);
const pkg = readJson(PKG_JSON);
const current = app.expo.version;
const { version, versionCode } = bumpVersion(current, opts.bump);
const tag = `v${version}`;
const commitAndTag = opts.git && opts.bump !== 'none';
const outDir = path.join(RELEASES_DIR, tag);
const baseName = `${slug(app.expo.name)}-${tag}-${versionCode}`;
const teamId = app.expo.ios?.appleTeamId;
const uploadKey = opts.android && opts.aab ? readUploadKey() : {};
const ascKey = opts.ios ? readAscKey() : {};

console.log(c.bold(`\n${app.expo.name} release (local build)`));
console.log(`  version      ${current} → ${c.green(version)}${opts.bump === 'none' ? ' (rebuild)' : ''}`);
console.log(`  build        ${app.expo.android?.versionCode ?? 1} → ${c.green(versionCode)} (Android versionCode, iOS buildNumber)`);
console.log(`  iOS          ${opts.ios ? `Xcode archive → ${opts.submit ? 'TestFlight upload' : `.ipa in releases/${tag}/`}` : 'skipped'}`);
const aabPlan = opts.aab ? `.aab${opts.play ? ' → Google Play' : ''} + ` : '';
console.log(`  Android      ${opts.android ? `Gradle ${aabPlan}APK → releases/${tag}/` : 'skipped'}`);
console.log(`  git          ${commitAndTag ? `commit + tag ${tag}` : 'no commit/tag'}`);

/* Pre-flight ------------------------------------------------------ */

if (opts.git || !opts.allowDirty) {
  const status = git('status', '--porcelain');
  if (!status.ok) fail('This is not a git repository. Use --no-git --allow-dirty.');
  if (status.out && !opts.allowDirty) {
    fail(`You have uncommitted changes:\n${status.out}\nCommit or stash them, or pass --allow-dirty.`);
  }
}
if (commitAndTag && git('rev-parse', '-q', '--verify', `refs/tags/${tag}`).ok) {
  fail(`Tag ${tag} already exists. Pick a different bump, or use "none" to rebuild.`);
}

const problems = checkSetup();
if (problems.length) fail(`Fix the build setup first:\n${problems.map((p) => `  • ${p}`).join('\n')}`);

if (opts.dryRun) {
  console.log(`\n${c.green('✔')} Dry run: the build setup looks ready; nothing changed.`);
  process.exit(0);
}

if (opts.checks) {
  step('Typecheck and lint');
  run('npx', ['tsc', '--noEmit']);
  run('npx', ['expo', 'lint'], { env: { CI: '1' } });
}

/* Version bump ---------------------------------------------------- */

step(`Set version ${version} (build ${versionCode})`);
app.expo.version = version;
app.expo.android = { ...app.expo.android, versionCode };
app.expo.ios = { ...app.expo.ios, buildNumber: String(versionCode) };
pkg.version = version;
writeJson(APP_JSON, app);
writeJson(PKG_JSON, pkg);
console.log('  updated app.json and package.json');

if (commitAndTag) {
  step(`Commit and tag ${tag}`);
  run('git', ['add', 'app.json', 'package.json']);
  run('git', ['commit', '-m', `chore(release): ${tag}`]);
  run('git', ['tag', '-a', tag, '-m', tag]);
}

/* Android (Gradle) ------------------------------------------------ */

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
let apkPath = null;
let aabPath = null;
let uploadKeySha1 = null;

if (opts.android) {
  step('Android: regenerate native project');
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], { env: { CI: '1' } });

  step('Android: build release APK');
  run(gradlew, [':app:assembleRelease', '--console=plain', '-q'], { cwd: ANDROID_DIR });
  if (!existsSync(APK_BUILT)) fail(`Gradle finished but ${path.relative(ROOT, APK_BUILT)} is missing.`);
  mkdirSync(outDir, { recursive: true });
  apkPath = path.join(outDir, `${baseName}.apk`);
  copyFileSync(APK_BUILT, apkPath);
  describeFile(apkPath);

  if (opts.aab) {
    // A separate Gradle run, because the injected signing key applies to every variant it
    // builds: the APK keeps the debug key (so sideloaded installs keep updating), the .aab
    // gets the upload key. The generated android/ project stays untouched.
    step('Android: build App Bundle (.aab) with the upload key');
    const { file, storePassword, alias, keyPassword } = uploadKey;
    run(
      gradlew,
      [
        ':app:bundleRelease',
        `-Pandroid.injected.signing.store.file=${file}`,
        `-Pandroid.injected.signing.store.password=${storePassword}`,
        `-Pandroid.injected.signing.key.alias=${alias}`,
        `-Pandroid.injected.signing.key.password=${keyPassword}`,
        '--console=plain',
        '-q',
      ],
      { cwd: ANDROID_DIR, secrets: [storePassword, keyPassword] },
    );
    if (!existsSync(AAB_BUILT)) fail(`Gradle finished but ${path.relative(ROOT, AAB_BUILT)} is missing.`);

    // Play rejects a bundle signed with the wrong key; catch the debug key here instead.
    const cert = spawnSync('keytool', ['-printcert', '-jarfile', AAB_BUILT], { encoding: 'utf8' });
    if (!cert.error && cert.status === 0) {
      if (/CN=Android Debug/.test(cert.stdout)) fail('The .aab is signed with the debug key, which Google Play rejects.');
      uploadKeySha1 = /SHA1:\s*([0-9A-F:]+)/.exec(cert.stdout)?.[1] ?? null;
    }

    aabPath = path.join(outDir, `${baseName}.aab`);
    copyFileSync(AAB_BUILT, aabPath);
    describeFile(aabPath);
    if (uploadKeySha1) console.log(`  upload key SHA-1 ${uploadKeySha1}`);
  }

  if (opts.install) {
    step('Android: install on device');
    run('adb', ['install', '-r', apkPath]);
  }

  if (opts.play) {
    step('Android: upload the .aab to Google Play');
    run('npx', [
      '--yes',
      'eas-cli@latest',
      'submit',
      '--platform',
      'android',
      '--profile',
      'production',
      '--path',
      aabPath,
      '--non-interactive',
    ]);
  }
}

/* iOS (Xcode) ----------------------------------------------------- */

let ipaPath = null;

if (opts.ios) {
  step('iOS: regenerate native project and install pods');
  run('npx', ['expo', 'prebuild', '--platform', 'ios', '--clean'], { env: { CI: '1' } });

  const workspace = readdirSync(IOS_DIR).find((name) => name.endsWith('.xcworkspace'));
  if (!workspace) fail('Prebuild finished but ios/ has no .xcworkspace.');
  const scheme = workspace.replace(/\.xcworkspace$/, '');
  const archivePath = path.join(IOS_BUILD_DIR, `${scheme}.xcarchive`);
  const exportPath = path.join(IOS_BUILD_DIR, 'export');
  const auth = ascKey.key
    ? ['-authenticationKeyPath', ascKey.key.file, '-authenticationKeyID', ascKey.key.id, '-authenticationKeyIssuerID', ascKey.key.issuer]
    : [];

  step('iOS: archive');
  runLogged(
    'xcodebuild',
    [
      'archive',
      '-workspace',
      path.join(IOS_DIR, workspace),
      '-scheme',
      scheme,
      '-configuration',
      'Release',
      '-destination',
      'generic/platform=iOS',
      '-archivePath',
      archivePath,
      '-allowProvisioningUpdates',
      ...auth,
      `DEVELOPMENT_TEAM=${teamId}`,
      'CODE_SIGN_STYLE=Automatic',
    ],
    path.join(IOS_BUILD_DIR, 'archive.log'),
  );

  // destination "upload" sends the build straight to App Store Connect; "export" writes an .ipa.
  // Xcode must not renumber the build: the build number comes from app.json.
  const exportOptions = path.join(IOS_BUILD_DIR, 'ExportOptions.plist');
  writeFileSync(
    exportOptions,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${opts.submit ? 'upload' : 'export'}</string>
  <key>teamID</key><string>${teamId}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
`,
  );

  step(opts.submit ? 'iOS: upload to App Store Connect (TestFlight)' : 'iOS: export .ipa');
  runLogged(
    'xcodebuild',
    [
      '-exportArchive',
      '-archivePath',
      archivePath,
      '-exportOptionsPlist',
      exportOptions,
      '-exportPath',
      exportPath,
      '-allowProvisioningUpdates',
      ...auth,
    ],
    path.join(IOS_BUILD_DIR, opts.submit ? 'upload.log' : 'export.log'),
  );

  if (opts.submit) {
    console.log('  uploaded');
  } else {
    const ipa = readdirSync(exportPath).find((name) => name.endsWith('.ipa'));
    if (!ipa) fail(`The export finished but ${path.relative(ROOT, exportPath)} has no .ipa.`);
    mkdirSync(outDir, { recursive: true });
    ipaPath = path.join(outDir, `${baseName}.ipa`);
    copyFileSync(path.join(exportPath, ipa), ipaPath);
    describeFile(ipaPath);
  }
}

/* Summary --------------------------------------------------------- */

console.log(`\n${c.green('✔')} ${c.bold(`Released ${tag}`)}`);
if (aabPath) {
  console.log(`  AAB         ${aabPath}`);
  console.log(`  Play        ${opts.play ? 'submitted (track from eas.json)' : 'upload it in Play Console → Test and release, or rerun with --play'}`);
}
if (apkPath) console.log(`  APK         ${apkPath}`);
if (opts.ios && opts.submit) console.log('  TestFlight  uploaded; Apple emails you once it is processed (10–30 min)');
if (ipaPath) console.log(`  IPA         ${ipaPath}`);
if (commitAndTag) console.log(`  git         tagged ${tag}. Push with: git push --follow-tags`);
