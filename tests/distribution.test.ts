import {describe, expect, it} from 'vitest';
import {assertDistributionApi, parseExtensionDistribution} from '../src/distribution.js';

const artifact = {size: 12, sha256: '1'.repeat(64)};
const distribution = {
  formatVersion: 1, id: 'sample', package: '@third-party/sample', version: '1.4.0',
  name: 'Sample', description: 'Example extension', license: 'MPL-2.0', execution: 'sandboxed',
  resources: {schemaVersion: 1, resources: []},
  bundle: {...artifact, file: 'sample.js'}, api: {...artifact, file: 'extension-manifest.json'}
};

describe('distribution metadata', () => {
  it('reads the same static contract in npm and Release directories', () => {
    expect(parseExtensionDistribution(JSON.parse(JSON.stringify(distribution)))).toEqual(distribution);
    expect(() => assertDistributionApi(parseExtensionDistribution(distribution),
      {id: 'sample', formatVersion: 1, blocks: []})).not.toThrow();
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

  it('rejects a manifest belonging to another extension', () => {
    expect(() => assertDistributionApi(parseExtensionDistribution(distribution),
      {id: 'other', formatVersion: 1, blocks: []})).toThrow(expect.objectContaining({code: 'API_MISMATCH'}));
  });
});
