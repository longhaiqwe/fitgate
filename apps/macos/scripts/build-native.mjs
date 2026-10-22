import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildTarget } from './build-target.mjs';

export function buildNative(root, target, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-target', target.swiftTarget,
    path.join(root, 'native/ActivityMonitor.swift'), '-o', output], { stdio: 'inherit' });
  const actual = execFileSync('/usr/bin/lipo', ['-archs', output], { encoding: 'utf8' }).trim();
  if (actual !== target.machArch) throw new Error(`Native monitor architecture mismatch: ${actual}`);
  console.log(`Native monitor: ${actual}, macOS ${target.minimumSystemVersion}+`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildNative(process.cwd(), buildTarget(), path.resolve('native/activity-monitor'));
}
