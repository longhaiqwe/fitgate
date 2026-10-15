import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildTarget } from './build-target.mjs';

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const machoMagic = new Set(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']);
function* binaries(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* binaries(file);
    else if (entry.isFile()) {
      const descriptor = fs.openSync(file, 'r'), magic = Buffer.alloc(4);
      try { fs.readSync(descriptor, magic, 0, 4, 0); } finally { fs.closeSync(descriptor); }
      if (machoMagic.has(magic.toString('hex'))) yield file;
    }
  }
}
function versionNumber(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
  return major * 1000000 + minor * 1000 + patch;
}
export function minimumVersions(loadCommands) {
  return [
    ...loadCommands.matchAll(/^\s+minos\s+(\d+(?:\.\d+)+)/gm),
    ...loadCommands.matchAll(/cmd LC_VERSION_MIN_MACOSX\s+cmdsize \d+\s+version (\d+(?:\.\d+)+)/g),
  ].map(match => match[1]);
}

export function verifyPackage(application, target) {
  const plist = path.join(application, 'Contents/Info.plist');
  const info = key => run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist]);
  const manifest = JSON.parse(fs.readFileSync(path.join(application, 'Contents/Resources/app/package.json')));
  assert.equal(info('LSMinimumSystemVersion'), target.minimumSystemVersion);
  assert.equal(info('CFBundleShortVersionString'), manifest.version);
  const native = path.join(application, 'Contents/Resources/app/native/activity-monitor');
  assert.ok(fs.existsSync(native), 'bundled native monitor exists');
  const checked = [];
  for (const file of binaries(application)) {
    const relative = path.relative(application, file);
    const arch = run('/usr/bin/lipo', ['-archs', file]);
    assert.equal(arch, target.machArch, `${relative}: all bundled binaries must match the release architecture`);
    const loadCommands = run('/usr/bin/xcrun', ['vtool', '-show-build', file]);
    const versions = minimumVersions(loadCommands);
    assert.ok(versions.length > 0, `${relative}: deployment target is declared`);
    for (const version of versions) assert.ok(versionNumber(version) <= versionNumber(target.minimumSystemVersion), `${relative}: requires macOS ${version}, higher than the declared ${target.minimumSystemVersion}`);
    // dyld_info handles Electron helper names containing parentheses, which otool parses as archive members.
    const dependencies = run('/usr/bin/xcrun', ['dyld_info', '-dependents', file]).split('\n').slice(1).map(line => line.match(/([@/].*)/)?.[1]).filter(Boolean);
    for (const dependency of dependencies) assert.ok(dependency.startsWith('@') || dependency.startsWith('/System/Library/') || dependency.startsWith('/usr/lib/'), `${relative}: nonportable library ${dependency}`);
    checked.push({ file: relative, arch, minimumVersions: versions });
  }
  assert.ok(checked.some(entry => entry.file === 'Contents/MacOS/FitGate'), 'main executable checked');
  assert.ok(checked.some(entry => entry.file.endsWith('/native/activity-monitor')), 'native monitor checked');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', application]);
  return { version: manifest.version, arch: target.arch, minimumSystemVersion: target.minimumSystemVersion, signature: 'ad-hoc (not notarized)', signatureVerified: true, binaries: checked };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node scripts/verify-package.mjs <app-path> <x64|arm64>');
  console.log(JSON.stringify(verifyPackage(path.resolve(process.argv[2]), buildTarget(process.argv[3])), null, 2));
}
