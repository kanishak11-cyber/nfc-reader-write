#!/usr/bin/env node
/**
 * Release helper.
 *
 *   npm run release -- <major|minor|patch|none> [options]
 *
 * 1. Bumps the version in app.json + package.json, and derives one build number
 *    from it (major*10000 + minor*100 + patch) for both the Android versionCode
 *    and the iOS buildNumber, so 1.2.3 is build 10203 on every platform and
 *    every release installs over the previous one. EAS reads both from app.json
 *    (eas.json → appVersionSource: local) and never changes them.
 * 2. Runs the typecheck and lint.
 * 3. Commits the bump and tags it vX.Y.Z (no push).
 * 4. Starts the iOS production build on EAS, auto-submitted to TestFlight.
 * 5. Builds the Android release APK locally and copies it to releases/vX.Y.Z/.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = path.join(ROOT, 'app.json');
const PKG_JSON = path.join(ROOT, 'package.json');
const ANDROID_DIR = path.join(ROOT, 'android');
const APK_BUILT = path.join(ANDROID_DIR, 'app/build/outputs/apk/release/app-release.apk');
const RELEASES_DIR = path.join(ROOT, 'releases');

const HELP = `
Usage: npm run release -- <major|minor|patch|none> [options]

Bump:
  major | minor | patch   Bump the version (1.2.3 → 2.0.0 | 1.3.0 | 1.2.4)
  none                    Rebuild the current version (no commit, no tag). TestFlight
                          accepts each build number once, so only use this for iOS
                          if the earlier upload of this version failed or was cancelled.

Options:
  --ios           Only build iOS
  --android       Only build the Android APK
  --no-submit     Build iOS but don't submit it to TestFlight
  --wait          Wait for the EAS iOS build to finish (default: start it and continue)
  --install       Install the APK on the connected Android device (adb install -r)
  --no-git        Don't commit or tag the version bump
  --allow-dirty   Allow running with uncommitted changes
  --skip-checks   Skip typecheck and lint
  --dry-run       Show what would happen without changing anything
  -h, --help      Show this help
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

function run(cmd, args, { cwd = ROOT, env = {}, capture = false } = {}) {
  console.log(c.dim(`  $ ${[cmd, ...args].join(' ')}`));
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
    wait: false,
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
      case '--wait':
        opts.wait = true;
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

/* ----------------------------------------------------------------- */

const opts = parseArgs(process.argv.slice(2));
const app = readJson(APP_JSON);
const pkg = readJson(PKG_JSON);
const current = app.expo.version;
const { version, versionCode } = bumpVersion(current, opts.bump);
const tag = `v${version}`;
const commitAndTag = opts.git && opts.bump !== 'none';

console.log(c.bold(`\n${app.expo.name} release`));
console.log(`  version      ${current} → ${c.green(version)}${opts.bump === 'none' ? ' (rebuild)' : ''}`);
console.log(`  build        ${app.expo.android?.versionCode ?? 1} → ${c.green(versionCode)} (Android versionCode, iOS buildNumber)`);
console.log(`  iOS          ${opts.ios ? `EAS production build${opts.submit ? ' → TestFlight' : ''}` : 'skipped'}`);
console.log(`  Android      ${opts.android ? `release APK → releases/${tag}/` : 'skipped'}`);
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

if (opts.dryRun) {
  console.log(`\n${c.green('✔')} Dry run: nothing changed.`);
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

/* iOS (cloud) ----------------------------------------------------- */

let iosBuildUrl = null;
if (opts.ios) {
  step(`iOS: EAS production build${opts.submit ? ' + TestFlight submit' : ''}`);
  const args = ['--yes', 'eas-cli@latest', 'build', '--platform', 'ios', '--profile', 'production', '--non-interactive', '--json'];
  if (opts.submit) args.push('--auto-submit');
  if (!opts.wait) args.push('--no-wait');
  const out = run('npx', args, { capture: true });
  try {
    const [build] = JSON.parse(out.slice(out.indexOf('[')));
    const owner = app.expo.owner;
    iosBuildUrl = `https://expo.dev/accounts/${owner}/projects/${app.expo.slug}/builds/${build.id}`;
    console.log(`  build ${build.appBuildVersion ?? ''} ${build.status?.toLowerCase() ?? ''}: ${iosBuildUrl}`);
  } catch {
    console.log(out.trim());
  }
}

/* Android (local) ------------------------------------------------- */

let apkPath = null;
if (opts.android) {
  step('Android: regenerate native project');
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], { env: { CI: '1' } });

  step('Android: build release APK');
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [':app:assembleRelease', '--console=plain', '-q'], {
    cwd: ANDROID_DIR,
  });
  if (!existsSync(APK_BUILT)) fail(`Gradle finished but ${path.relative(ROOT, APK_BUILT)} is missing.`);

  const outDir = path.join(RELEASES_DIR, tag);
  mkdirSync(outDir, { recursive: true });
  apkPath = path.join(outDir, `${slug(app.expo.name)}-${tag}-${versionCode}.apk`);
  copyFileSync(APK_BUILT, apkPath);
  const mb = (statSync(apkPath).size / 1024 / 1024).toFixed(1);
  console.log(`  ${path.relative(ROOT, apkPath)} (${mb} MB)`);
  console.log(`  sha256 ${sha256(apkPath)}`);

  if (opts.install) {
    step('Android: install on device');
    run('adb', ['install', '-r', apkPath]);
  }
}

/* Summary --------------------------------------------------------- */

console.log(`\n${c.green('✔')} ${c.bold(`Released ${tag}`)}`);
if (apkPath) console.log(`  APK         ${apkPath}`);
if (iosBuildUrl) {
  console.log(`  iOS build   ${iosBuildUrl}`);
  if (opts.submit) console.log('  TestFlight  submits when the build finishes; Apple emails you once it is processed');
}
if (commitAndTag) console.log(`  git         tagged ${tag}. Push with: git push --follow-tags`);
