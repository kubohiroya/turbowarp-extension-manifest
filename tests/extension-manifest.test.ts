import {describe, expect, it} from 'vitest';
import schema from '../schemas/extension-manifest.schema.json' with {type: 'json'};
import {
  createTurboWarpBlockDefinitions,
  createTurboWarpExtensionInfo,
  createExtensionManifest,
  EXTENSION_MANIFEST_EFFECTS,
  EXTENSION_MANIFEST_FORMAT_VERSION,
  EXTENSION_MANIFEST_FORMAT_VERSIONS,
  EXTENSION_MANIFEST_RESULT_TYPES,
  extensionManifestPlugin,
  serializeExtensionManifest
} from '../src/index.js';
import expectedManifest from './fixtures/extension-manifest.json' with {type: 'json'};
import sourceFixture from './fixtures/extension-manifest-source.json' with {type: 'json'};

describe('extension API manifest', () => {
  it('serializes a fixture deterministically using the template contract', () => {
    expect(createExtensionManifest(sourceFixture.id, sourceFixture.definitions)).toEqual(
      expectedManifest
    );
    expect(serializeExtensionManifest(sourceFixture.id, sourceFixture.definitions)).toBe(
      `${JSON.stringify(expectedManifest, null, 2)}\n`
    );
  });

  it('keeps the JSON Schema format versions aligned with the generator', () => {
    expect(schema.$defs.manifestV1.properties.formatVersion.const).toBe(
      EXTENSION_MANIFEST_FORMAT_VERSION
    );
    expect([
      schema.$defs.manifestV1.properties.formatVersion.const,
      schema.$defs.manifestV2.properties.formatVersion.const
    ]).toEqual([...EXTENSION_MANIFEST_FORMAT_VERSIONS]);
  });

  it('keeps the JSON Schema version 2 vocabularies aligned with the generator', () => {
    expect(schema.$defs.blockV2.properties.resultType.enum).toEqual([
      ...EXTENSION_MANIFEST_RESULT_TYPES
    ]);
    expect(schema.$defs.blockV2.properties.effect.enum).toEqual([...EXTENSION_MANIFEST_EFFECTS]);
  });

  it('rejects duplicate opcodes', () => {
    expect(() =>
      createExtensionManifest('fixtureextension', {
        blocks: [
          {opcode: 'same', blockType: 'COMMAND'},
          {opcode: 'same', blockType: 'REPORTER'}
        ]
      })
    ).toThrow('Duplicate block opcode: same');
  });

  it('rejects an argument that references an unknown menu', () => {
    expect(() =>
      createExtensionManifest('fixtureextension', {
        blocks: [
          {
            opcode: 'choose',
            blockType: 'REPORTER',
            arguments: {VALUE: {type: 'STRING', menu: 'missing'}}
          }
        ]
      })
    ).toThrow('references unknown menu: missing');
  });

  it('provides the Vite plugin contract used by turbowarp-extension-template', () => {
    const emitted: unknown[] = [];
    const plugin = extensionManifestPlugin({
      id: sourceFixture.id,
      definitions: sourceFixture.definitions,
      fileName: 'api.json'
    });
    plugin.generateBundle.call({
      emitFile(file) {
        emitted.push(file);
      }
    });
    expect(emitted).toEqual([
      {
        type: 'asset',
        fileName: 'api.json',
        source: `${JSON.stringify(expectedManifest, null, 2)}\n`
      }
    ]);
  });

  it('maps manifest-like block definitions to TurboWarp getInfo blocks', () => {
    const Scratch = {
      BlockType: {HAT: 'hat', REPORTER: 'reporter', COMMAND: 'command'},
      ArgumentType: {STRING: 'string', NUMBER: 'number'}
    };
    const source = [
      {
        opcode: 'whenStarted',
        blockType: 'HAT',
        text: 'when started',
        arguments: {}
      },
      {
        opcode: 'value',
        blockType: 'REPORTER',
        text: 'value [NAME]',
        arguments: {
          NAME: {type: 'STRING', defaultValue: 'name'},
          INDEX: {type: 'NUMBER', defaultValue: 0, menu: 'indexes'}
        }
      }
    ];

    expect(
      createTurboWarpBlockDefinitions(Scratch, source, {
        disableReporterMonitors: true,
        decorateBlock(definition) {
          return definition.blockType === 'HAT' ? {isEdgeActivated: false} : {};
        }
      })
    ).toEqual([
      {
        opcode: 'whenStarted',
        blockType: 'hat',
        text: 'when started',
        arguments: {},
        isEdgeActivated: false
      },
      {
        opcode: 'value',
        blockType: 'reporter',
        text: 'value [NAME]',
        disableMonitor: true,
        arguments: {
          NAME: {type: 'string', defaultValue: 'name'},
          INDEX: {type: 'number', defaultValue: 0, menu: 'indexes'}
        }
      }
    ]);
  });

  it('creates reusable TurboWarp extension info without handlers', () => {
    const Scratch = {
      BlockType: {REPORTER: 'reporter'},
      ArgumentType: {STRING: 'string'}
    };

    expect(
      createTurboWarpExtensionInfo(
        Scratch,
        {
          id: 'fixture',
          name: 'Fixture',
          blocks: [
            {
              opcode: 'status',
              blockType: 'REPORTER',
              text: 'status',
              arguments: {}
            }
          ],
          menus: {choices: {acceptReporters: true, items: ['a']}}
        },
        {
          blockIconURI: 'data:image/svg+xml,fixture',
          color1: '#111111',
          disableReporterMonitors: true
        }
      )
    ).toEqual({
      id: 'fixture',
      name: 'Fixture',
      blockIconURI: 'data:image/svg+xml,fixture',
      color1: '#111111',
      blocks: [
        {
          opcode: 'status',
          blockType: 'reporter',
          text: 'status',
          disableMonitor: true,
          arguments: {}
        }
      ],
      menus: {choices: {acceptReporters: true, items: ['a']}}
    });
  });

  it('rejects incomplete Scratch block boundaries', () => {
    expect(() =>
      createTurboWarpBlockDefinitions(
        {BlockType: {REPORTER: 'reporter'}, ArgumentType: {}},
        [
          {
            opcode: 'status',
            blockType: 'REPORTER',
            text: 'status',
            arguments: {VALUE: {type: 'STRING'}}
          }
        ]
      )
    ).toThrow('Scratch.ArgumentType.STRING is required.');
  });
});

const V2_BLOCK = {
  opcode: 'getValue',
  blockType: 'REPORTER',
  arguments: {KEY: {type: 'STRING', defaultValue: 'message'}},
  resultType: 'string',
  effect: 'storage-read',
  immutable: true,
  errors: ['KVS_KEY_INVALID', 'KVS_STORAGE_FAILURE'],
  server: {supported: true, irOperation: 'kvs.getText'}
} as const;

function v2(overrides: Record<string, unknown> = {}) {
  return {blocks: [{...V2_BLOCK, ...overrides}]};
}

describe('extension API manifest format version 2', () => {
  it('emits the compiler metadata after the version 1 keys', () => {
    const manifest = createExtensionManifest('fixtureextension', v2(), {formatVersion: 2});

    expect(manifest.formatVersion).toBe(2);
    expect(Object.keys(manifest.blocks[0]!)).toEqual([
      'opcode',
      'blockType',
      'arguments',
      'resultType',
      'effect',
      'immutable',
      'errors',
      'server'
    ]);
    // Error codes read as a documented list, so their declared order survives.
    expect(manifest.blocks[0]!.errors).toEqual(['KVS_KEY_INVALID', 'KVS_STORAGE_FAILURE']);
  });

  // This is what let every version 1 repository adopt the package without its manifest changing.
  it('ignores the metadata at format version 1', () => {
    expect(createExtensionManifest('fixtureextension', v2())).toEqual(
      createExtensionManifest('fixtureextension', {
        blocks: [{opcode: 'getValue', blockType: 'REPORTER', arguments: {KEY: {type: 'STRING'}}}]
      })
    );
  });

  it('requires every metadata field', () => {
    for (const key of ['resultType', 'effect', 'immutable', 'errors', 'server'] as const) {
      const block: Record<string, unknown> = {...V2_BLOCK};
      delete block[key];
      expect(() =>
        createExtensionManifest('fixtureextension', {blocks: [block]}, {formatVersion: 2})
      ).toThrow(`must declare ${key} for format version 2`);
    }
  });

  it('rejects an effect outside the shared vocabulary', () => {
    expect(() =>
      createExtensionManifest('fixtureextension', v2({effect: 'disk-write'}), {formatVersion: 2})
    ).toThrow('effect must be one of');
  });

  it('rejects a server hint that claims support without an operation', () => {
    expect(() =>
      createExtensionManifest('fixtureextension', v2({server: {supported: true}}), {
        formatVersion: 2
      })
    ).toThrow('server.irOperation is required when supported is true');
  });

  it('accepts an unsupported server hint without an operation', () => {
    const manifest = createExtensionManifest(
      'fixtureextension',
      v2({server: {supported: false}}),
      {formatVersion: 2}
    );

    expect(manifest.blocks[0]!.server).toEqual({supported: false});
  });

  it('carries argument constraints only at format version 2', () => {
    const definitions = {
      blocks: [
        {
          ...V2_BLOCK,
          arguments: {PATH: {type: 'STRING', normalizesTo: 'pathSegments', staticLiteral: true, minimum: 0, maximum: 9}}
        }
      ]
    };

    expect(
      createExtensionManifest('fixtureextension', definitions, {formatVersion: 2}).blocks[0]!
        .arguments[0]
    ).toEqual({id: 'PATH', type: 'STRING', normalizesTo: 'pathSegments', staticLiteral: true, minimum: 0, maximum: 9});
    expect(createExtensionManifest('fixtureextension', definitions).blocks[0]!.arguments[0]).toEqual({
      id: 'PATH',
      type: 'STRING'
    });
  });

  it('rejects an unsupported format version', () => {
    expect(() =>
      createExtensionManifest('fixtureextension', v2(), {
        formatVersion: 3 as unknown as 2
      })
    ).toThrow('Unsupported extension manifest format version: 3');
  });
});

describe('extension API manifest extension-level types', () => {
  const types = {
    pathSegmentType: {
      kind: 'discriminatedUnion',
      variants: [
        {kind: 'key', valueType: 'string'},
        {kind: 'index', valueType: 'nonNegativeInteger'}
      ]
    },
    dataReferenceType: {
      kind: 'named',
      scope: 'target',
      lifetime: 'untilProjectStop',
      valueType: 'jsonValue'
    }
  };

  it('carries them at format version 2, between the ID and the blocks', () => {
    const manifest = createExtensionManifest(
      'fixtureextension',
      {...types, ...v2()},
      {formatVersion: 2}
    );

    expect(Object.keys(manifest)).toEqual([
      'formatVersion',
      'id',
      'pathSegmentType',
      'dataReferenceType',
      'blocks',
      'menus'
    ]);
    expect(manifest.pathSegmentType).toEqual(types.pathSegmentType);
    expect(manifest.dataReferenceType).toEqual(types.dataReferenceType);
  });

  it('omits them at format version 1', () => {
    expect(Object.keys(createExtensionManifest('fixtureextension', {...types, ...v2()}))).toEqual([
      'formatVersion',
      'id',
      'blocks',
      'menus'
    ]);
  });

  // turbowarp-structured-data needs this value; none of the others describe mutating held data.
  it('accepts the state effect', () => {
    expect(
      createExtensionManifest('fixtureextension', v2({effect: 'state'}), {formatVersion: 2})
        .blocks[0]!.effect
    ).toBe('state');
  });

  it('rejects a malformed path segment type', () => {
    expect(() =>
      createExtensionManifest(
        'fixtureextension',
        {...v2(), pathSegmentType: {kind: 'union', variants: []}},
        {formatVersion: 2}
      )
    ).toThrow('pathSegmentType kind must be discriminatedUnion');
  });

  it('rejects an incomplete data reference type', () => {
    expect(() =>
      createExtensionManifest(
        'fixtureextension',
        {...v2(), dataReferenceType: {kind: 'named', scope: 'target', lifetime: 'untilProjectStop'}},
        {formatVersion: 2}
      )
    ).toThrow('dataReferenceType valueType');
  });
});

describe('extension API manifest block metadata supplied separately', () => {
  // Block definitions ship inside the extension bundle, so version 2 metadata kept there would be
  // delivered to every project that loads the extension even though only the build reads it.
  it('merges metadata by opcode without touching the definitions', () => {
    const definitions = {
      blocks: [{opcode: 'getValue', blockType: 'REPORTER', arguments: {KEY: {type: 'STRING'}}}]
    };
    const blockMetadata = {
      getValue: {
        resultType: 'string',
        effect: 'storage-read',
        immutable: true,
        errors: ['KVS_KEY_INVALID', 'KVS_STORAGE_FAILURE'],
        server: {supported: true, irOperation: 'kvs.getText'}
      }
    };

    expect(
      createExtensionManifest('fixtureextension', definitions, {formatVersion: 2, blockMetadata})
    ).toEqual(createExtensionManifest('fixtureextension', v2(), {formatVersion: 2}));
  });

  it('still requires the metadata when an opcode is missing from it', () => {
    expect(() =>
      createExtensionManifest(
        'fixtureextension',
        {blocks: [{opcode: 'other', blockType: 'COMMAND', arguments: {}}]},
        {formatVersion: 2, blockMetadata: {getValue: {}}}
      )
    ).toThrow('must declare resultType for format version 2');
  });
});
