import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildTarget } from './build-target.mjs';
import { buildNative } from './build-native.mjs';
import { verifyPackage } from './verify-package.mjs';
const root = process.cwd();
const target = buildTarget();
const stage = path.join(root, 'build', `package-${target.arch}`);
const build = path.join(root, 'build');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const directory of ['dist', 'electron', 'src/shared']) {
  fs.cpSync(path.join(root, directory), path.join(stage, directory), { recursive: true });
}
fs.mkdirSync(path.join(stage, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(root, 'scripts/smoke.mjs'), path.join(stage, 'scripts/smoke.mjs'));
fs.mkdirSync(path.join(stage, 'native'), { recursive: true });
buildNative(root, target, path.join(stage, 'native/activity-monitor'));
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: manifest.name, productName: 'FitGate', version: manifest.version, description: manifest.description, author: manifest.author, type: 'module', main: manifest.main }, null, 2));
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
  dir: stage, out: path.join(root, 'release'), name: 'FitGate', platform: 'darwin', arch: target.arch,
  appBundleId: 'com.fitgate.desktop', appCategoryType: 'public.app-category.healthcare-fitness',
  appVersion: manifest.version, buildVersion: manifest.version, electronVersion: manifest.devDependencies.electron,
  // Optional local Electron ZIP avoids downloading the same runtime again.
  electronZipDir: process.env.FITGATE_ELECTRON_ZIP_DIR,
  icon, overwrite: true, prune: true, asar: false,
  extendInfo: {
    NSCameraUsageDescription: 'FitGate 使用摄像头在本机识别你的动作，画面不会上传。你也可以选择无摄像头纯计时模式。',
    NSAppleEventsUsageDescription: '网站监控模式需要读取浏览器当前标签页的网址，以判断是否属于你选择的受控网站。不会保存完整网址或浏览历史。',
    LSMinimumSystemVersion: target.minimumSystemVersion,
    NSHumanReadableCopyright: 'FitGate'
  }
});
const application = path.join(outputs[0], 'FitGate.app');
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', application], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', application], { stdio: 'inherit' });
const verification = verifyPackage(application, target);
fs.writeFileSync(path.join(root, 'release', `compatibility-${target.arch}.json`), JSON.stringify(verification, null, 2) + '\n');
console.log(`Verified ${verification.binaries.length} Mach-O binaries for ${target.arch}, macOS ${target.minimumSystemVersion}+`);
const archive = path.join(root, 'release', `FitGate-${manifest.version}-macOS-${target.arch}.zip`);
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', application, archive]);
console.log(`APP: ${application}\nZIP: ${archive}`);
