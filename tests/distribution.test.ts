import {describe, expect, expectTypeOf, it} from 'vitest';
import {Ajv2020} from 'ajv/dist/2020.js';
import schema from '../schemas/extension-package.schema.json' with {type: 'json'};
import resourceSchema from '../schemas/resource-declaration.schema.json' with {type: 'json'};
import {DistributionError, assertDistributionApi, parseExtensionDistribution} from '../src/distribution.js';

const artifact = {size: 12, sha256: '1'.repeat(64)};
const distribution = {
  formatVersion: 1, id: 'sample', package: '@third-party/sample', version: '1.4.0',
  name: 'Sample', description: 'Example extension', license: 'MPL-2.0', execution: 'sandboxed',
  resources: {schemaVersion: 1, resources: []},
  bundle: {...artifact, file: 'sample.js'}, api: {...artifact, file: 'extension-manifest.json'}
};

describe('distribution metadata', () => {
  it('keeps downstream diagnostic codes supported by the public error types', () => {
    expectTypeOf(DistributionError).constructorParameters.toEqualTypeOf<[string, string, ErrorOptions?]>();
    expectTypeOf<DistributionError['code']>().toEqualTypeOf<string>();
  });

  it('reads the same static contract in npm and Release directories', () => {
    expect(parseExtensionDistribution(JSON.parse(JSON.stringify(distribution)))).toEqual(distribution);
    expect(() => assertDistributionApi(parseExtensionDistribution(distribution),
      {id: 'sample', formatVersion: 1, blocks: [], menus: []})).not.toThrow();
  });

  it.each([
    ['unknown version', {formatVersion: 0}, 'UNSUPPORTED_DESCRIPTOR'],
    ['escaping filename', {bundle: {...artifact, file: '../sample.js'}}, 'INVALID_DESCRIPTOR'],
    ['ambiguous filename', {bundle: {...artifact, file: 'other%2fsample.js'}}, 'INVALID_DESCRIPTOR'],
    ['unbounded number', {bundle: {...artifact, file: 'sample.js', size: Infinity}}, 'INVALID_DESCRIPTOR'],
    ['mutable npm version', {version: 'latest'}, 'INVALID_DESCRIPTOR'],
    ['missing resource declaration', {resources: undefined}, 'INVALID_RESOURCES'],
    ['unknown execution mode', {execution: 'trusted'}, 'INVALID_DESCRIPTOR'],
  ])('rejects %s', (_label, patch, code) => {
    expect(() => parseExtensionDistribution({...distribution, ...patch})).toThrow(expect.objectContaining({code}));
  });

  it('publishes a JSON Schema which agrees on valid and invalid distribution paths', () => {
    const ajv = new Ajv2020({strict: true, strictRequired: false});
    const validate = ajv.addSchema(resourceSchema).compile(schema);
    expect(validate(distribution)).toBe(true);
    expect(validate({...distribution, bundle: {...artifact, file: '../sample.js'}})).toBe(false);
  });

  it('rejects a manifest belonging to another extension', () => {
    expect(() => assertDistributionApi(parseExtensionDistribution(distribution),
      {id: 'other', formatVersion: 1, blocks: []})).toThrow(expect.objectContaining({code: 'API_MISMATCH'}));
  });
});
