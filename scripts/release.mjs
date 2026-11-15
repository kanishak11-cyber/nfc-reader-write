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
 * 5. Starts the Android production build on EAS: the signed .aab for Google Play.
 * 6. Builds the Android release APK locally (for sideloading) while the .aab builds in the
 *    cloud, then downloads the .aab. Both land in releases/vX.Y.Z/.
 */
import { spawn, spawnSync } from 'node:child_process';
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
                          Google Play also accepts each versionCode once.

Options:
  --ios           Only build iOS
  --android       Only build Android (the .aab and the APK)
  --no-submit     Build iOS but don't submit it to TestFlight
  --wait          Wait for the EAS iOS build to finish (default: start it and continue)
  --no-aab        Skip the EAS .aab build (Android: APK only)
  --no-download   Start the .aab build but don't wait to download it into releases/
  --play          Submit the .aab to Google Play when it's built (EAS needs your Google
                  service account key; the track comes from eas.json, internal by default)
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
    aab: true,
    download: true,
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
      case '--wait':
        opts.wait = true;
        break;
      case '--no-aab':
        opts.aab = false;
        break;
      case '--no-download':
        opts.download = false;
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

/** Runs a command without blocking, keeping its output to report at the end. */
function runInBackground(cmd, args) {
  console.log(c.dim(`  $ ${[cmd, ...args].join(' ')}`));
  const child = spawn(cmd, args, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  return new Promise((resolve) => {
    child.on('error', (error) => resolve({ status: -1, stdout, stderr: `${stderr}\n${error.message}` }));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

/** The first build in `eas build --json` output, or null when the output isn't JSON. */
function easBuild(out) {
  try {
    return JSON.parse(out.slice(out.indexOf('[')))[0] ?? null;
  } catch {
    return null;
  }
}

function buildPage(build) {
  return `https://expo.dev/accounts/${app.expo.owner}/projects/${app.expo.slug}/builds/${build.id}`;
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

function describeFile(file) {
  const mb = (statSync(file).size / 1024 / 1024).toFixed(1);
  console.log(`  ${path.relative(ROOT, file)} (${mb} MB)`);
  console.log(`  sha256 ${sha256(file)}`);
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

console.log(c.bold(`\n${app.expo.name} release`));
console.log(`  version      ${current} → ${c.green(version)}${opts.bump === 'none' ? ' (rebuild)' : ''}`);
console.log(`  build        ${app.expo.android?.versionCode ?? 1} → ${c.green(versionCode)} (Android versionCode, iOS buildNumber)`);
console.log(`  iOS          ${opts.ios ? `EAS production build${opts.submit ? ' → TestFlight' : ''}` : 'skipped'}`);
const aabPlan = !opts.aab ? '' : `EAS .aab${opts.play ? ' → Google Play' : ''}${opts.download ? '' : ' (not downloaded)'} + `;
console.log(`  Android      ${opts.android ? `${aabPlan}release APK → releases/${tag}/` : 'skipped'}`);
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

/* Cloud builds (EAS) ---------------------------------------------- */

// The .aab builds in the cloud while the APK builds here; the script waits for it at the end.
let aabBuildPage = null;
let aabPending = null;
if (opts.android && opts.aab) {
  step(`Android: EAS production build (.aab)${opts.play ? ' + Google Play submit' : ''}`);
  const args = ['--yes', 'eas-cli@latest', 'build', '--platform', 'android', '--profile', 'production', '--non-interactive', '--json'];
  if (opts.play) args.push('--auto-submit');
  if (opts.download) {
    aabPending = runInBackground('npx', args);
    console.log('  building in the cloud; the APK builds meanwhile');
  } else {
    const build = easBuild(run('npx', [...args, '--no-wait'], { capture: true }));
    if (build) {
      aabBuildPage = buildPage(build);
      console.log(`  build ${build.appBuildVersion ?? ''} ${build.status?.toLowerCase() ?? ''}: ${aabBuildPage}`);
    }
  }
}

let iosBuildUrl = null;
if (opts.ios) {
  step(`iOS: EAS production build${opts.submit ? ' + TestFlight submit' : ''}`);
  const args = ['--yes', 'eas-cli@latest', 'build', '--platform', 'ios', '--profile', 'production', '--non-interactive', '--json'];
  if (opts.submit) args.push('--auto-submit');
  if (!opts.wait) args.push('--no-wait');
  const out = run('npx', args, { capture: true });
  const build = easBuild(out);
  if (build) {
    iosBuildUrl = buildPage(build);
    console.log(`  build ${build.appBuildVersion ?? ''} ${build.status?.toLowerCase() ?? ''}: ${iosBuildUrl}`);
  } else {
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

  mkdirSync(outDir, { recursive: true });
  apkPath = path.join(outDir, `${baseName}.apk`);
  copyFileSync(APK_BUILT, apkPath);
  describeFile(apkPath);

  if (opts.install) {
    step('Android: install on device');
    run('adb', ['install', '-r', apkPath]);
  }
}

/* Android .aab (cloud) -------------------------------------------- */

let aabPath = null;
if (aabPending) {
  step('Android: wait for the EAS .aab build');
  const result = await aabPending;
  const build = easBuild(result.stdout);
  if (build) aabBuildPage = buildPage(build);
  if (result.status !== 0 || !build) {
    console.error(result.stderr.trim().split('\n').slice(-25).join('\n'));
    fail(`The EAS Android build failed${aabBuildPage ? `: ${aabBuildPage}` : '. See the output above, or the Builds page on expo.dev.'}`);
  }
  const url = build.artifacts?.buildUrl ?? build.artifacts?.applicationArchiveUrl;
  if (!url) fail(`The .aab build finished but has no download link. Get it from ${aabBuildPage}`);
  mkdirSync(outDir, { recursive: true });
  aabPath = path.join(outDir, `${baseName}.aab`);
  try {
    await download(url, aabPath);
  } catch (error) {
    fail(`Couldn't download the .aab (${error.message}). Get it from ${aabBuildPage}`);
  }
  describeFile(aabPath);
}

/* Summary --------------------------------------------------------- */

console.log(`\n${c.green('✔')} ${c.bold(`Released ${tag}`)}`);
if (aabPath) console.log(`  AAB         ${aabPath}`);
else if (aabBuildPage) console.log(`  AAB         building on EAS: ${aabBuildPage}`);
if (aabBuildPage && opts.play) console.log('  Play        submits when the build finishes (track from eas.json)');
if (apkPath) console.log(`  APK         ${apkPath}`);
if (iosBuildUrl) {
  console.log(`  iOS build   ${iosBuildUrl}`);
  if (opts.submit) console.log('  TestFlight  submits when the build finishes; Apple emails you once it is processed');
}
if (commitAndTag) console.log(`  git         tagged ${tag}. Push with: git push --follow-tags`);
