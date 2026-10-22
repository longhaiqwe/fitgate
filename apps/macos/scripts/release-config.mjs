import path from 'node:path';
import fs from 'node:fs';

const machMagic = new Set(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']);
export function ignoreSigningResource(file) {
  if (fs.statSync(file).isDirectory()) return !/\.(app|framework)$/.test(file);
  const descriptor = fs.openSync(file, 'r'), header = Buffer.alloc(4);
  try { fs.readSync(descriptor, header, 0, 4, 0); } finally { fs.closeSync(descriptor); }
  // Images, model weights and Chromium data are sealed by their containing
  // bundle. Only executable code and nested bundles need their own signature.
  return !machMagic.has(header.toString('hex'));
}

export function selectDeveloperIdentity(output, requested = '') {
  const identities = [...output.matchAll(/\b([A-Fa-f0-9]{40})\s+"(Developer ID Application: [^"]+ \(([A-Z0-9]+)\))"/g)]
    .map(([, hash, name, teamId]) => ({ hash, name, teamId }));
  const matches = requested ? identities.filter(item => item.hash.toLowerCase() === requested.toLowerCase() || item.name === requested) : identities;
  if (matches.length !== 1) throw new Error('Select exactly one valid Developer ID Application identity with FITGATE_SIGN_IDENTITY. Apple Development and ad-hoc identities cannot be used for release.');
  return matches[0];
}

export function signingOptions(identity) {
  return {
    identity: identity.hash,
    ignore: [ignoreSigningResource],
    preAutoEntitlements: false,
    optionsForFile(file) {
      if (path.basename(file) === 'FitGate.app') {
        return { hardenedRuntime: true, entitlements: [
          'com.apple.security.cs.allow-jit',
          'com.apple.security.device.camera',
          'com.apple.security.automation.apple-events'
        ] };
      }
      if (path.basename(file) === 'activity-monitor') {
        return { hardenedRuntime: true, entitlements: [] };
      }
      // Keep Electron's per-helper entitlements and secure timestamps.
      return { hardenedRuntime: true };
    }
  };
}

export function parseSignature(output) {
  return {
    authority: output.match(/^Authority=(Developer ID Application: .+)$/m)?.[1] || null,
    teamId: output.match(/^TeamIdentifier=(.+)$/m)?.[1] || null,
    hardenedRuntime: /flags=.*\bruntime\b/.test(output),
    timestamp: output.match(/^Timestamp=(.+)$/m)?.[1] || null,
    cdhash: output.match(/^CDHash=(.+)$/m)?.[1] || null,
    adHoc: /^Signature=adhoc$/m.test(output)
  };
}

export function assertReleaseSignature(signature, expectedTeam) {
  if (!signature.authority || signature.adHoc || !signature.hardenedRuntime || !signature.timestamp) {
    throw new Error('Release requires Developer ID signing, Hardened Runtime and a secure timestamp.');
  }
  if (expectedTeam && signature.teamId !== expectedTeam) throw new Error('Release signing Team ID does not match.');
}
