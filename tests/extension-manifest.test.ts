import {describe, expect, it} from 'vitest';
import schema from '../schemas/extension-manifest.schema.json' with {type: 'json'};
import {
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
});
