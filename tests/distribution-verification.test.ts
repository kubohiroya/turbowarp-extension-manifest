import {describe, expect, it} from 'vitest';
import {Ajv2020} from 'ajv/dist/2020.js';
import {createExtensionManifest, parseExtensionManifest} from '../src/index.js';
import {
  assertDistributionApi, assertDistributionPackage, assertDistributionSettings,
  createExtensionDistribution, parseExtensionDistribution, verifyExtensionDistribution
} from '../src/distribution.js';
import {parseExtensionBuildProfile, STANDARD_BUILD_PROFILE} from '../src/build-profile.js';
import distribution from './fixtures/distribution/dist/extension-package.json' with {type: 'json'};
import api from './fixtures/distribution/dist/extension-manifest.json' with {type: 'json'};
import pkg from './fixtures/distribution/package.json' with {type: 'json'};
import settings from './fixtures/distribution/src/extension-config.json' with {type: 'json'};
import profile from './fixtures/distribution/extension-build.json' with {type: 'json'};
import sources from './fixtures/distribution/sources.json' with {type: 'json'};
import distributionSchema from '../schemas/extension-package.schema.json' with {type: 'json'};
import resourceSchema from '../schemas/resource-declaration.schema.json' with {type: 'json'};
import apiSchema from '../schemas/extension-manifest.schema.json' with {type: 'json'};
import bundleSource from './fixtures/distribution/dist/sample.js?raw';
import apiSource from './fixtures/distribution/dist/extension-manifest.json?raw';

const bundle = new TextEncoder().encode(bundleSource);
const apiBytes = new TextEncoder().encode(apiSource);
const parsed = parseExtensionDistribution(distribution);
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const ajv = new Ajv2020({strict: true, strictRequired: false});
const validateDescriptor = ajv.addSchema(resourceSchema).compile(distributionSchema);
const validateApi = ajv.compile(apiSchema);

describe('distribution verification', () => {
  it.each(sources)('uses the same bytes and relative layout for $kind', async source => {
    const files = new Map([
      [source.root + source.descriptor, encode(distribution)],
      [source.root + 'dist/sample.js', bundle],
      [source.root + 'dist/extension-manifest.json', apiBytes]
    ]);
    const descriptor = JSON.parse(new TextDecoder().decode(files.get(source.root + source.descriptor)));
    const directory = source.root + 'dist/';
    const result = await verifyExtensionDistribution(descriptor, {
      bundle: files.get(directory + descriptor.bundle.file)!, api: files.get(directory + descriptor.api.file)!
    });
    expect(result.distribution).toEqual(distribution);
    expect(result.api).toEqual(api);
    assertDistributionPackage(result.distribution, pkg);
    assertDistributionSettings(result.distribution, settings);
    expect(parseExtensionBuildProfile(profile)).toEqual(STANDARD_BUILD_PROFILE);
    expect(validateDescriptor(descriptor)).toBe(true);
    expect(validateApi(result.api)).toBe(true);
    expect(globalThis).not.toHaveProperty('__distributionFixtureExecuted');
  });

  it('generates the fixture from canonical metadata and final bytes', async () => {
    expect(await createExtensionDistribution(pkg, settings, {file: 'sample.js', bytes: bundle}, apiBytes))
      .toEqual(distribution);
    expect(await createExtensionDistribution(pkg, settings, {file: 'sample.js', bytes: bundle}, apiBytes))
      .toEqual(distribution);
  });

  it.each(['bundle', 'api'] as const)('rejects a changed size or hash for %s', async field => {
    const bytes = {bundle, api: apiBytes};
    await expect(verifyExtensionDistribution(distribution, {...bytes, [field]: bytes[field].slice(1)}))
      .rejects.toMatchObject({code: 'SIZE_MISMATCH'});
    const changed = bytes[field].slice();
    changed[0] = changed[0]! ^ 1;
    await expect(verifyExtensionDistribution(distribution, {...bytes, [field]: changed}))
      .rejects.toMatchObject({code: 'HASH_MISMATCH'});
  });

  it('takes a byte snapshot before awaiting hashes', async () => {
    const mutable = apiBytes.slice();
    const mutableBundle = bundle.slice();
    const result = verifyExtensionDistribution(distribution, {bundle: mutableBundle, api: mutable});
    mutable.fill(0);
    mutableBundle.fill(0);
    const verified = await result;
    expect(verified.api).toEqual(api);
    expect(verified.bytes.api).toEqual(apiBytes);
    expect(verified.bytes.bundle).toEqual(bundle);
  });

  it.each([
    {name: 'other'}, {version: '1.4.1'}, {license: 'MIT'},
    {turbowarpExtension: {resourceDeclaration: {schemaVersion: 1, resources: []}}}
  ])('rejects inconsistent package data %o', patch => {
    expect(() => assertDistributionPackage(parsed, {...pkg, ...patch}))
      .toThrow(expect.objectContaining({code: 'PACKAGE_MISMATCH'}));
  });

  it.each([undefined, {}, {resourceDeclaration: {schemaVersion: 2, resources: []}}])
  ('rejects missing or invalid package resources %o', turbowarpExtension => {
    expect(() => assertDistributionPackage(parsed, {...pkg, turbowarpExtension}))
      .toThrow(expect.objectContaining({code: 'INVALID_RESOURCES'}));
  });

  it('compares resource object keys independent of serialization order', () => {
    const resources = pkg.turbowarpExtension.resourceDeclaration;
    assertDistributionPackage(parsed, {...pkg, turbowarpExtension: {resourceDeclaration: {
      resources: resources.resources.map(({purpose, ...rest}) => ({purpose, ...rest})), schemaVersion: 1
    }}});
  });

  it.each([{id: 'other'}, {name: 'Other'}, {description: 'Other'}, {license: 'MIT'}, {unsandboxed: true}])
  ('rejects inconsistent source settings %o', patch => {
    expect(() => assertDistributionSettings(parsed, {...settings, ...patch}))
      .toThrow(expect.objectContaining({code: 'SETTINGS_MISMATCH'}));
  });

  it.each(['../sample.js', '/sample.js', 'C:\\sample.js', 'https://host/sample.js',
    'nested/sample.js', 'nested\\sample.js', '%2e%2e%2fsample.js', 'sample.js?x', 'sample.js#x'])
  ('rejects path ambiguity in the schema and reader: %s', file => {
    const input = {...distribution, bundle: {...distribution.bundle, file}};
    expect(validateDescriptor(input)).toBe(false);
    expect(() => parseExtensionDistribution(input)).toThrow(expect.objectContaining({code: 'INVALID_DESCRIPTOR'}));
  });

  it('rejects source observations embedded in author metadata', () => {
    expect(() => parseExtensionDistribution({...distribution, resolvedCommit: 'a'.repeat(40)}))
      .toThrow(expect.objectContaining({code: 'INVALID_DESCRIPTOR'}));
  });

  it('rejects invalid JSON and invalid UTF-8 even if their hashes match', async () => {
    for (const bytes of [new TextEncoder().encode('export default {}'), new Uint8Array([0xff])]) {
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      await expect(verifyExtensionDistribution({...distribution, api: {...distribution.api, size: bytes.length, sha256}},
        {bundle, api: bytes})).rejects.toMatchObject({code: 'API_MISMATCH'});
    }
  });
});

describe('API manifest reader and writer compatibility', () => {
  const block = {opcode: 'status', blockType: 'REPORTER', arguments: {KEY: {type: 'STRING', menu: 'keys'}}};
  const definitions = {blocks: [block], menus: {keys: {acceptReporters: false}}};

  it.each([1, 2] as const)('round trips format %i through the existing writer', formatVersion => {
    const manifest = createExtensionManifest('sample', definitions, {formatVersion, blockMetadata: {
      status: {resultType: 'string', effect: 'pure', immutable: true, errors: [], server: {supported: false}}
    }});
    expect(validateApi(manifest)).toBe(true);
    expect(parseExtensionManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    expect(() => assertDistributionApi(parsed, manifest)).not.toThrow();
  });

  it('preserves v2 argument constraints and extension-level types', () => {
    const manifest = createExtensionManifest('sample', {
      blocks: [{...block, arguments: {KEY: {type: 'STRING', menu: 'keys', normalizesTo: 'pathSegments',
        staticLiteral: false, minimum: 0, maximum: 5}}}], menus: definitions.menus,
      pathSegmentType: {kind: 'discriminatedUnion', variants: [{kind: 'key', valueType: 'string'}]},
      dataReferenceType: {kind: 'reference', scope: 'target', lifetime: 'project', valueType: 'json'}
    }, {formatVersion: 2, blockMetadata: {status: {
      resultType: 'json', effect: 'state', immutable: false, errors: ['INVALID_PATH'],
      server: {supported: true, irOperation: 'sample.status'}
    }}});
    expect(validateApi(manifest)).toBe(true);
    expect(parseExtensionManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    for (const patch of [
      {server: {supported: true}}, {resultType: 'unknown'}, {effect: 'unknown'}, {immutable: 'false'},
      {errors: [null]}, {server: {supported: false, plugin: 'malicious.js'}},
      {arguments: [{id: 'KEY', type: 'STRING', staticLiteral: 'false'}]}
    ]) {
      expect(() => parseExtensionManifest({...manifest, blocks: [{...manifest.blocks[0], ...patch}]})).toThrow();
    }
  });

  it.each([
    {...api, menus: undefined}, {...api, formatVersion: 3}, {...api, unexpected: true},
    {...api, blocks: [...api.blocks, ...api.blocks]},
    {...api, menus: [{id: 'keys', acceptReporters: false}, {id: 'keys', acceptReporters: false}]},
    {...api, blocks: [{...api.blocks[0], arguments: [{id: 'X', type: 'STRING', menu: 'missing'}]}]},
    {...api, blocks: [{...api.blocks[0], arguments: [{id: 'X', type: 'STRING'}, {id: 'X', type: 'NUMBER'}]}]},
    {...api, blocks: [{...api.blocks[0], blockType: ''}]},
    {...api, formatVersion: 2}
  ])('rejects invalid structure or duplicate IDs', input => {
    expect(() => assertDistributionApi(parsed, input)).toThrow(expect.objectContaining({code: 'API_MISMATCH'}));
  });
});
