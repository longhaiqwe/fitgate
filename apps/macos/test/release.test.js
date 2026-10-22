import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectDeveloperIdentity, parseSignature, assertReleaseSignature, signingOptions, ignoreSigningResource } from '../scripts/release-config.mjs';
import { notarizeApplication } from '../scripts/notarize.mjs';

const developer = 'A'.repeat(40);
const identities = `1) ${developer} "Developer ID Application: Example (TEAM123456)"\n2) ${'B'.repeat(40)} "Apple Development: Example (TEAM123456)"`;
test('release identity selection excludes development certificates and rejects ambiguous identities', () => {
  assert.equal(selectDeveloperIdentity(identities).hash, developer);
  assert.equal(selectDeveloperIdentity(identities, developer.toLowerCase()).teamId, 'TEAM123456');
  assert.throws(() => selectDeveloperIdentity(identities, 'B'.repeat(40)), /Developer ID/);
  assert.throws(() => selectDeveloperIdentity(identities + `\n3) ${'C'.repeat(40)} "Developer ID Application: Other (OTHER12345)"`), /exactly one/);
});
test('release verification rejects ad-hoc, missing hardened runtime, timestamp and wrong team', () => {
  const raw = 'Authority=Developer ID Application: Example (TEAM123456)\nTeamIdentifier=TEAM123456\nCodeDirectory v=20500 flags=0x10000(runtime)\nTimestamp=Oct 22, 2026\nCDHash=abcdef';
  const good = parseSignature(raw);
  assert.doesNotThrow(() => assertReleaseSignature(good, 'TEAM123456'));
  for (const patch of [{ adHoc: true }, { hardenedRuntime: false }, { timestamp: null }, { authority: null }]) {
    assert.throws(() => assertReleaseSignature({ ...good, ...patch }), /Release requires/);
  }
  assert.throws(() => assertReleaseSignature(good, 'OTHER12345'), /Team ID/);
});
test('app has camera and automation entitlements while the native monitor has no JIT exception', () => {
  const opts = signingOptions(selectDeveloperIdentity(identities));
  const main = opts.optionsForFile('/tmp/FitGate.app');
  assert.ok(main.entitlements.includes('com.apple.security.device.camera'));
  assert.ok(main.entitlements.includes('com.apple.security.automation.apple-events'));
  assert.deepEqual(opts.optionsForFile('/tmp/FitGate.app/Contents/Resources/app/native/activity-monitor'), { hardenedRuntime: true, entitlements: [] });
});
test('sign executable code and bundles, seal model weights and images as resources', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitgate-signing-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['FitGate.app', 'Electron.framework']) {
    fs.mkdirSync(path.join(dir, name));
    assert.equal(ignoreSigningResource(path.join(dir, name)), false);
  }
  const binary = path.join(dir, 'activity-monitor');
  fs.writeFileSync(binary, Buffer.from('cffaedfe00000000', 'hex'));
  assert.equal(ignoreSigningResource(binary), false);
  const weights = path.join(dir, 'weights.bin');
  fs.writeFileSync(weights, Buffer.from('0001020304050607', 'hex'));
  assert.equal(ignoreSigningResource(weights), true);
});

function fixture(t, { status = 'Accepted', failGatekeeper = false, failWaitOnce = false } = {}) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitgate-release-test-'));
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
  const events = [];
  let waitingFailed = false;
  const run = (command, args) => {
    const event = command.endsWith('xcrun') ? args.slice(0, 2).join(' ') : path.basename(command);
    events.push(event);
    if (event === 'notarytool submit') return JSON.stringify({ id: 'test-submission' });
    if (event === 'notarytool wait') {
      if (failWaitOnce && !waitingFailed) { waitingFailed = true; throw new Error('timeout'); }
      return JSON.stringify({ id: 'test-submission', status });
    }
    if (event === 'spctl' && failGatekeeper) throw new Error('Gatekeeper rejected');
    if (event === 'ditto') {
      const destination = args.at(-1);
      if (destination.endsWith('.tmp')) {
        assert.ok(events.includes('stapler validate'));
        assert.ok(events.includes('spctl'));
      }
      fs.writeFileSync(destination, 'test archive');
    }
    return '';
  };
  const options = { application: '/tmp/FitGate.app', target: { arch: 'arm64' }, outputDirectory, profile: 'test-profile', verification: { version: '1.1.7', signing: { cdhash: 'test-hash' } }, run };
  return { options, events, archive: path.join(outputDirectory, 'FitGate-1.1.7-macOS-arm64.zip') };
}
test('a rejected notarization never creates a distributable archive', t => {
  const f = fixture(t, { status: 'Invalid' });
  assert.throws(() => notarizeApplication(f.options), /Invalid/);
  assert.equal(fs.existsSync(f.archive), false);
  assert.equal(f.events.includes('stapler staple'), false);
});
test('Gatekeeper failure after acceptance still blocks the release ZIP', t => {
  const f = fixture(t, { failGatekeeper: true });
  assert.throws(() => notarizeApplication(f.options), /Gatekeeper rejected/);
  assert.equal(fs.existsSync(f.archive), false);
});
test('accepted submissions produce a stapled archive and checksum after all checks', t => {
  const f = fixture(t);
  const result = notarizeApplication(f.options);
  assert.equal(result.stapled, true);
  assert.equal(result.gatekeeperAccepted, true);
  assert.match(fs.readFileSync(f.archive + '.sha256', 'utf8'), /^[a-f0-9]{64}  FitGate-/);
  assert.throws(() => notarizeApplication(f.options), /Refusing to overwrite/);
});
test('a timed-out wait resumes the original submission without uploading twice', t => {
  const f = fixture(t, { failWaitOnce: true });
  assert.throws(() => notarizeApplication(f.options), /Resume/);
  assert.equal(fs.existsSync(f.archive), false);
  assert.equal(notarizeApplication(f.options).status, 'Accepted');
  assert.equal(f.events.filter(event => event === 'notarytool submit').length, 1);
});
test('missing credentials fail before executing any signing or network command', t => {
  const f = fixture(t);
  assert.throws(() => notarizeApplication({ ...f.options, profile: '' }), /FITGATE_NOTARY_PROFILE/);
  assert.equal(f.events.length, 0);
});
