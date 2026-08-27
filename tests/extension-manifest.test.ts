import {describe, expect, it} from 'vitest';
import schema from '../schemas/extension-manifest.schema.json' with {type: 'json'};
import {
  createTurboWarpBlockDefinitions,
  createTurboWarpExtensionInfo,
  createExtensionManifest,
  EXTENSION_MANIFEST_FORMAT_VERSION,
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

  it('keeps the JSON Schema format version aligned with the generator', () => {
    expect(schema.properties.formatVersion.const).toBe(EXTENSION_MANIFEST_FORMAT_VERSION);
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
