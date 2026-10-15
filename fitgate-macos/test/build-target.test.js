import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTarget } from '../scripts/build-target.mjs';
import { minimumVersions } from '../scripts/verify-package.mjs';

test('Intel packaging uses an Intel Swift monitor with the same system baseline', () => {
  const target = buildTarget('x64');
  assert.equal(target.arch, 'x64');
  assert.equal(target.machArch, 'x86_64');
  assert.equal(target.swiftTarget, 'x86_64-apple-macosx13.0');
  assert.equal(target.minimumSystemVersion, '13.0');
});

test('Apple Silicon packaging uses an arm64 Swift monitor with the same system baseline', () => {
  const target = buildTarget('arm64');
  assert.equal(target.swiftTarget, 'arm64-apple-macosx13.0');
  assert.equal(target.machArch, 'arm64');
  assert.equal(target.minimumSystemVersion, '13.0');
});

test('unsupported architectures fail before compilation or packaging', () => {
  for (const arch of ['ia32', 'universal', 'x86_64', '', '../x64', 'toString', '__proto__']) {
    assert.throws(() => buildTarget(arch), /Unsupported macOS architecture/);
  }
});

test('binary deployment checks ignore SDK and linker versions', () => {
  assert.deepEqual(minimumVersions('      cmd LC_BUILD_VERSION\n platform MACOS\n    minos 13.0\n      sdk 26.5\n   ntools 1\n     tool LD\n  version 1267.0'), ['13.0']);
  assert.deepEqual(minimumVersions('      cmd LC_VERSION_MIN_MACOSX\n  cmdsize 16\n  version 10.15\n      sdk 26.5'), ['10.15']);
  assert.deepEqual(minimumVersions(''), []);
});
