# turbowarp-extension-manifest

[日本語](README.ja.md)

`@kubohiroya/turbowarp-extension-manifest` provides the extension manifest contract used by `turbowarp-extension-template`.

Use it when a TurboWarp extension repository needs the same deterministic `dist/extension-manifest.json` contract without copying manifest code from the template.

## Scope

- Create deterministic extension API manifests from `src/block-definitions.json`-style data.
- Validate duplicate opcodes and menu references.
- Serialize manifests with stable key order.
- Reuse the same JSON Schema as `turbowarp-extension-template`.
- Map manifest-like block definitions into TurboWarp `getInfo()` block definitions without copying Scratch type-mapping code.
- Emit format version 2, which adds the per-block metadata a server-side compiler needs to lower a block.

## Format versions

Version 1 is the default and carries the block palette only: opcode, block type and arguments.

Version 2 adds, on every block, the metadata a server-side compiler needs in order to lower it:
`resultType`, `effect`, `immutable`, `errors` and `server`. Arguments may additionally carry
`normalizesTo`, `staticLiteral`, `minimum` and `maximum`. All five block fields are required
together — a block carrying only some of them produces a manifest the compiler rejects wholesale.

```ts
serializeExtensionManifest(extensionConfig.id, definitions, {formatVersion: 2});
```

The `effect` vocabulary is the one `turbowarp-http-server`'s compiler manifest reader accepts:
`pure`, `immutable`, `control`, `request-read`, `response-write`, `storage-read`, `storage-write`,
`binary-read`, `binary-write`, `state`. Keep the two in step — a value added here that the reader
rejects produces an extension no server can compile.

`resultType` is one of `json`, `boolean`, `number`, `string`, `void`, `jsonText` or `yamlText`.

Version 2 also accepts two optional extension-level descriptions, `pathSegmentType` and
`dataReferenceType`, emitted between `id` and `blocks`.

Block definitions are bundled into the extension JavaScript, so metadata added to them would ship to
every project that loads the extension even though only the build reads it. Keep it in a separate
build-time file and pass it as `blockMetadata`, keyed by opcode:

```ts
import definitions from './src/block-definitions.json' with {type: 'json'};
import blockMetadata from './src/block-metadata.json' with {type: 'json'};

extensionManifestPlugin({id: extensionConfig.id, definitions, blockMetadata, formatVersion: 2});
```

Passing no `formatVersion` emits exactly what version 1 emitted before, even when the block
definitions already carry version 2 metadata, so a repository can adopt this package without its
published manifest changing.

## Example

```ts
import {
  createTurboWarpExtensionInfo,
  createExtensionManifest,
  serializeExtensionManifest
} from '@kubohiroya/turbowarp-extension-manifest';

const definitions = {
  blocks: [
    {
      opcode: 'status',
      blockType: 'REPORTER',
      text: 'extension status',
      arguments: {}
    }
  ]
};

const manifest = createExtensionManifest('example3d', definitions);
const source = serializeExtensionManifest('example3d', definitions);

class ExampleExtension {
  constructor(Scratch) {
    this.Scratch = Scratch;
  }

  getInfo() {
    return createTurboWarpExtensionInfo(
      this.Scratch,
      {id: 'example3d', name: 'Example 3D', blocks: definitions.blocks},
      {disableReporterMonitors: true}
    );
  }

  status() {
    return 'ready';
  }
}
```

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```
