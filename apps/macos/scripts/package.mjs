import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTarget } from './build-target.mjs';
import { buildNative } from './build-native.mjs';
import { verifyPackage } from './verify-package.mjs';
import { selectDeveloperIdentity, signingOptions } from './release-config.mjs';
import { notarizeApplication } from './notarize.mjs';
const root = process.cwd();
const target = buildTarget();
const release = process.argv.includes('--release');
const signOnly = process.argv.includes('--sign-only');
const developerSigning = release || signOnly;
const profile = process.env.FITGATE_NOTARY_PROFILE;
if (release && !profile?.trim()) throw new Error('Set FITGATE_NOTARY_PROFILE to an existing notarytool Keychain profile. Release never falls back to ad-hoc signing.');
const identity = developerSigning ? selectDeveloperIdentity(execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }), process.env.FITGATE_SIGN_IDENTITY) : null;
const outputDirectory = path.join(root, 'release', developerSigning ? (signOnly ? 'candidates' : 'notarized') : '');
// Do not replace a previously notarized app or submission when restarting a build.
if (developerSigning && (fs.existsSync(path.join(outputDirectory, `notarization-${target.arch}.json`)) || fs.existsSync(path.join(outputDirectory, `FitGate-darwin-${target.arch}`)))) {
  throw new Error(`A signed candidate already exists in ${outputDirectory}. Resume notarization or archive it before rebuilding.`);
}
if (release) execFileSync('/usr/bin/xcrun', ['notarytool', 'history', '--keychain-profile', profile, '--output-format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] });
const stage = path.join(root, 'build', `package-${target.arch}`);
const build = path.join(root, 'build');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const directory of ['dist', 'electron', 'src/shared']) {
  fs.cpSync(path.join(root, directory), path.join(stage, directory), { recursive: true });
}
// Main-process modules use the same package as the bundled renderer. Copy real
// files into the app so it never depends on the workspace's development symlink.
const coreRoot = fileURLToPath(new URL('../../../packages/workout-core/', import.meta.url));
const coreDestination = path.join(stage, 'node_modules/@fitgate/workout-core');
fs.mkdirSync(coreDestination, { recursive: true });
fs.copyFileSync(path.join(coreRoot, 'package.json'), path.join(coreDestination, 'package.json'));
fs.cpSync(path.join(coreRoot, 'src'), path.join(coreDestination, 'src'), { recursive: true });
fs.mkdirSync(path.join(stage, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts/smoke.mjs'), path.join(stage, 'scripts/smoke.mjs'));
fs.mkdirSync(path.join(stage, 'native'), { recursive: true });
buildNative(root, target, path.join(stage, 'native/activity-monitor'));
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: manifest.name, productName: 'FitGate', version: manifest.version, description: manifest.description, author: manifest.author, type: 'module', main: manifest.main, dependencies: { '@fitgate/workout-core': manifest.dependencies['@fitgate/workout-core'] } }, null, 2));
const iconset = path.join(build, 'FitGate.iconset');
fs.mkdirSync(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    execFileSync('/usr/bin/sips', ['-z', String(size * scale), String(size * scale), path.join(root, 'public/icons/icon128.png'), '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], { stdio: 'ignore' });
  }
}
const icon = path.join(build, 'FitGate.icns');
execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', icon]);
const outputs = await packager({
  dir: stage, out: outputDirectory, name: 'FitGate', platform: 'darwin', arch: target.arch,
  appBundleId: 'com.fitgate.desktop', appCategoryType: 'public.app-category.healthcare-fitness',
  appVersion: manifest.version, buildVersion: manifest.version, electronVersion: manifest.devDependencies.electron,
  // Optional local Electron ZIP avoids downloading the same runtime again.
  electronZipDir: process.env.FITGATE_ELECTRON_ZIP_DIR,
  icon, overwrite: true, prune: true, asar: false,
  osxSign: identity ? signingOptions(identity) : undefined,
  extendInfo: {
    NSCameraUsageDescription: 'FitGate 使用摄像头在本机识别你的动作，画面不会上传。你也可以选择无摄像头纯计时模式。',
    NSAppleEventsUsageDescription: '网站监控模式需要读取浏览器当前标签页的网址，以判断是否属于你选择的受控网站。不会保存完整网址或浏览历史。',
    LSMinimumSystemVersion: target.minimumSystemVersion,
    NSHumanReadableCopyright: 'FitGate'
  }
});
const application = path.join(outputs[0], 'FitGate.app');
if (!developerSigning) execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', application], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', application], { stdio: 'inherit' });
const verification = verifyPackage(application, target, { requireDeveloperId: developerSigning, expectedTeam: identity?.teamId });
fs.writeFileSync(path.join(outputDirectory, `compatibility-${target.arch}.json`), JSON.stringify(verification, null, 2) + '\n');
console.log(`Verified ${verification.binaries.length} Mach-O binaries for ${target.arch}, macOS ${target.minimumSystemVersion}+`);
if (release) {
  notarizeApplication({ application, target, outputDirectory, profile, verification });
} else if (signOnly) {
  console.log(`SIGNED CANDIDATE (not notarized): ${application}`);
} else {
  const archive = path.join(outputDirectory, `FitGate-${manifest.version}-macOS-${target.arch}.zip`);
  execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', application, archive]);
  console.log(`APP: ${application}\nDEVELOPMENT ZIP (not notarized): ${archive}`);
}
