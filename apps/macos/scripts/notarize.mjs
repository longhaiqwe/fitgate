import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildTarget } from './build-target.mjs';
import { verifyPackage } from './verify-package.mjs';

// A failed, rejected or unfinished submission must never create a release ZIP.
export function notarizeApplication({ application, target, outputDirectory, profile, verification, run = execFileSync }) {
  if (!profile?.trim()) throw new Error('Set FITGATE_NOTARY_PROFILE to an existing notarytool Keychain profile.');
  const auth = ['--keychain-profile', profile];
  const json = args => {
    try {
      return JSON.parse(run('/usr/bin/xcrun', ['notarytool', ...args, ...auth, '--output-format', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (error) {
      // notarytool can return a nonzero exit code for a completed rejection.
      // Preserve that terminal status so its log is fetched and reported.
      try {
        const response = JSON.parse(error.stdout?.toString() || '');
        if (args[0] === 'wait' && ['Invalid', 'Rejected'].includes(response.status)) return response;
      } catch { /* A transport error has no structured rejection. */ }
      throw error;
    }
  };
  const reportPath = path.join(outputDirectory, `notarization-${target.arch}.json`);
  const candidateZip = path.join(outputDirectory, `.FitGate-${verification.version}-${target.arch}-submission.zip`);
  const archive = path.join(outputDirectory, `FitGate-${verification.version}-macOS-${target.arch}.zip`);
  if (fs.existsSync(archive)) throw new Error(`Refusing to overwrite an existing release archive: ${archive}`);
  fs.mkdirSync(outputDirectory, { recursive: true });
  let report;
  if (fs.existsSync(reportPath)) {
    report = JSON.parse(fs.readFileSync(reportPath));
    if (report.cdhash !== verification.signing.cdhash) throw new Error('Saved notarization belongs to a different signed app; use a fresh output directory.');
  } else {
    run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', application, candidateZip]);
    console.log(`Submitting ${target.arch} to Apple…`);
    const submission = json(['submit', candidateZip]);
    if (!submission.id) throw new Error('Apple did not return a notarization submission ID.');
    report = { id: submission.id, status: 'Submitted', arch: target.arch, version: verification.version, cdhash: verification.signing.cdhash, submittedAt: new Date().toISOString() };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`Apple submission ${report.id}; waiting for acceptance…`);
  let result;
  try {
    result = json(['wait', report.id, '--timeout', '20m']);
  } catch (error) {
    // Preserve the ID for resuming without rebuilding/re-signing or re-uploading.
    throw new Error(`Notarization wait did not finish. Resume scripts/notarize.mjs with this same app and output directory. Submission: ${report.id}`, { cause: error });
  }
  report.status = result.status;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  const logFile = path.join(outputDirectory, `notarization-${target.arch}-log.json`);
  run('/usr/bin/xcrun', ['notarytool', 'log', report.id, ...auth, logFile], { stdio: 'inherit' });
  if (result.status !== 'Accepted') throw new Error(`Apple notarization was ${result.status}; inspect ${logFile}. No release ZIP was created.`);
  run('/usr/bin/xcrun', ['stapler', 'staple', application], { stdio: 'inherit' });
  run('/usr/bin/xcrun', ['stapler', 'validate', application], { stdio: 'inherit' });
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', application], { stdio: 'inherit' });
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', application], { stdio: 'inherit' });
  // The final archive contains the stapled ticket and is made only after every gate.
  const temporaryArchive = archive + '.tmp';
  try {
    run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', application, temporaryArchive]);
    fs.renameSync(temporaryArchive, archive);
  } finally { fs.rmSync(temporaryArchive, { force: true }); }
  const sha256 = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  report = { ...report, stapled: true, gatekeeperAccepted: true, archive: path.basename(archive), sha256, completedAt: new Date().toISOString() };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(archive + '.sha256', `${sha256}  ${path.basename(archive)}\n`);
  fs.rmSync(candidateZip, { force: true });
  console.log(`NOTARIZED ZIP: ${archive}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { app: { type: 'string' }, arch: { type: 'string' }, output: { type: 'string' }, profile: { type: 'string', default: process.env.FITGATE_NOTARY_PROFILE } } });
  if (!values.app || !values.arch || !values.output) throw new Error('Usage: node scripts/notarize.mjs --app <FitGate.app> --arch <arm64|x64> --output <release-directory> [--profile <Keychain profile>]');
  const application = path.resolve(values.app), target = buildTarget(values.arch);
  const verification = verifyPackage(application, target, { requireDeveloperId: true });
  notarizeApplication({ application, target, outputDirectory: path.resolve(values.output), profile: values.profile, verification });
}
