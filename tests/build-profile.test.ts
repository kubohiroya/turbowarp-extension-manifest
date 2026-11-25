import {describe, expect, it} from 'vitest';
import {Ajv2020} from 'ajv/dist/2020.js';
import schema from '../schemas/extension-build.schema.json' with {type: 'json'};
import {parseExtensionBuildProfile, parseExtensionBuildSettings, STANDARD_BUILD_PROFILE} from '../src/build-profile.js';

const settings = {
  id: 'greeting', slug: 'greeting', name: 'Greeting', description: 'Example extension',
  author: 'Independent author', license: 'MPL-2.0', unsandboxed: false,
  docsURI: 'https://example.test/greeting', blockIconURI: 'data:image/svg+xml;base64,PHN2Zz4='
};
const validate = new Ajv2020({strict: true}).compile(schema);

describe('standard TypeScript source profile', () => {
  it('reads and freezes the fixed layout from a JSON value', () => {
    const input = JSON.parse(JSON.stringify(STANDARD_BUILD_PROFILE));
    expect(validate(input)).toBe(true);
    const profile = parseExtensionBuildProfile(input);
    expect(profile).toEqual(input);
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it.each([
    {entry: '../index.ts'},
    {entry: 'src/%2e%2e/index.ts'},
    {settings: 'src/config.ts'},
    {blocks: 'https://example.test/blocks.json'},
    {lockfile: '/tmp/pnpm-lock.yaml'},
    {dependencies: 'install'},
    {script: 'node setup.js'},
    {plugins: ['./custom-plugin.js']},
    {tsconfig: 'tsconfig.custom.json'}
  ])('rejects arbitrary host inputs %o in both readers', patch => {
    const input = {...STANDARD_BUILD_PROFILE, ...patch};
    expect(validate(input)).toBe(false);
    expect(() => parseExtensionBuildProfile(input)).toThrow(expect.objectContaining({code: 'INVALID_BUILD_PROFILE'}));
  });

  it.each([{formatVersion: 2}, {profile: 'custom-typescript-v1'}])('rejects unknown formats %o', patch => {
    const input = {...STANDARD_BUILD_PROFILE, ...patch};
    expect(validate(input)).toBe(false);
    expect(() => parseExtensionBuildProfile(input)).toThrow(expect.objectContaining({code: 'UNSUPPORTED_BUILD_PROFILE'}));
  });
});

describe('extension build settings', () => {
  it('reads extension metadata as data and keeps the requested execution mode', () => {
    expect(parseExtensionBuildSettings(settings)).toEqual(settings);
    expect(parseExtensionBuildSettings({...settings, unsandboxed: true}).unsandboxed).toBe(true);
    expect(Object.isFrozen(parseExtensionBuildSettings(settings))).toBe(true);
  });

  it.each([
    {id: 'invalid/extension'},
    {slug: '../extension'},
    {name: 'Name\n// ID: other'},
    {unsandboxed: undefined},
    {unsandboxed: 'false'},
    {docsURI: 'https://name:secret@example.test/'},
    {docsURI: 'file:///tmp/secret'},
    {blockIconURI: 'https://example.test/icon.svg'},
    {plugin: './custom.js'}
  ])('rejects invalid metadata %o', patch => {
    expect(() => parseExtensionBuildSettings({...settings, ...patch}))
      .toThrow(expect.objectContaining({code: 'INVALID_BUILD_SETTINGS'}));
  });
});
