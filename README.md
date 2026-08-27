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
