// Run this same module in Node and a headless browser after building dist/.
import {
  assertDistributionPackage, assertDistributionSettings, createExtensionDistribution, parseExtensionDistribution,
  verifyExtensionDistribution
} from '../dist/distribution.js';
import {parseExtensionBuildProfile, STANDARD_BUILD_PROFILE} from '../dist/build-profile.js';

export async function checkDistributionParity(load) {
  const root = 'tests/fixtures/distribution/';
  const json = async path => JSON.parse(new TextDecoder().decode(await load(root + path)));
  const descriptor = await json('dist/extension-package.json');
  const pkg = await json('package.json');
  const settings = await json('src/extension-config.json');
  const sources = await json('sources.json');
  const bytes = {bundle: await load(root + 'dist/sample.js'), api: await load(root + 'dist/extension-manifest.json')};
  parseExtensionBuildProfile(await json('extension-build.json'));
  const generated = await createExtensionDistribution(pkg, settings, {file: 'sample.js', bytes: bytes.bundle}, bytes.api);
  if (JSON.stringify(generated) !== JSON.stringify(descriptor)) throw new Error('Generated descriptor differs');
  const results = [];
  for (const source of sources) {
    const directory = source.root + 'dist/';
    const files = new Map([[directory + descriptor.bundle.file, bytes.bundle], [directory + descriptor.api.file, bytes.api]]);
    const result = await verifyExtensionDistribution(descriptor, {
      bundle: files.get(directory + descriptor.bundle.file), api: files.get(directory + descriptor.api.file)
    });
    assertDistributionPackage(result.distribution, pkg);
    assertDistributionSettings(result.distribution, settings);
    results.push({kind: source.kind, result: {distribution: result.distribution, api: result.api}});
  }
  const invalid = [
    ['unknown-version', () => parseExtensionDistribution({...descriptor, formatVersion: 9}), 'UNSUPPORTED_DESCRIPTOR'],
    ['path-escape', () => parseExtensionDistribution({...descriptor, bundle: {...descriptor.bundle, file: '../sample.js'}}), 'INVALID_DESCRIPTOR'],
    ['missing-resources', () => parseExtensionDistribution({...descriptor, resources: undefined}), 'INVALID_RESOURCES'],
    ['duplicate-resources', () => parseExtensionDistribution({...descriptor, resources: {
      schemaVersion: 1, resources: [...descriptor.resources.resources, ...descriptor.resources.resources]
    }}), 'INVALID_RESOURCES'],
    ['unknown-profile', () => parseExtensionBuildProfile({...STANDARD_BUILD_PROFILE, profile: 'other'}), 'UNSUPPORTED_BUILD_PROFILE'],
    ...['script', 'plugins', 'eval'].map(field => [field,
      () => parseExtensionBuildProfile({...STANDARD_BUILD_PROFILE, [field]: 'malicious.js'}), 'INVALID_BUILD_PROFILE']),
    ['package-version', () => assertDistributionPackage(descriptor, {...pkg, version: '9.0.0'}), 'PACKAGE_MISMATCH'],
    ['execution', () => assertDistributionSettings(descriptor, {...settings, unsandboxed: true}), 'SETTINGS_MISMATCH'],
    ['size', () => verifyExtensionDistribution(descriptor, {...bytes, bundle: bytes.bundle.slice(1)}), 'SIZE_MISMATCH'],
    ['hash', () => verifyExtensionDistribution({...descriptor, bundle: {...descriptor.bundle, sha256: '0'.repeat(64)}}, bytes), 'HASH_MISMATCH']
  ];
  for (const [label, run, expected] of invalid) {
    let code;
    try { await run(); } catch (error) { code = error.code; }
    if (code !== expected) throw new Error(label + ': expected ' + expected + ', got ' + code);
    results.push({label, code});
  }
  if ('__distributionFixtureExecuted' in globalThis) throw new Error('Extension bundle executed');
  return results;
}
