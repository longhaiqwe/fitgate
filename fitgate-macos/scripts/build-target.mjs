export const minimumSystemVersion = '13.0';

export function buildTarget(arch = process.env.FITGATE_ARCH || process.arch) {
  if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported macOS architecture: ${arch}. Use arm64 or x64.`);
  const machArch = arch === 'x64' ? 'x86_64' : 'arm64';
  return { arch, machArch, minimumSystemVersion, swiftTarget: `${machArch}-apple-macosx${minimumSystemVersion}` };
}
