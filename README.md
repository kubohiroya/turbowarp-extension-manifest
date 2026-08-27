# turbowarp-extension-manifest

[日本語](README.ja.md)

`@kubohiroya/turbowarp-extension-manifest` provides the extension manifest contract used by `turbowarp-extension-template`.

Use it when a TurboWarp extension repository needs the same deterministic `dist/extension-manifest.json` contract without copying manifest code from the template.

## Scope

- Create deterministic extension API manifests from `src/block-definitions.json`-style data.
- Validate duplicate opcodes and menu references.
- Serialize manifests with stable key order.
- Reuse the same JSON Schema as `turbowarp-extension-template`.

## Example

```ts
import {
  createExtensionManifest,
  serializeExtensionManifest
} from '@kubohiroya/turbowarp-extension-manifest';

const manifest = createExtensionManifest('example3d', {
  blocks: [
    {
      opcode: 'status',
      blockType: 'REPORTER',
      arguments: {}
    }
  ]
});

const source = serializeExtensionManifest('example3d', {
    blocks: [
      {
        opcode: 'status',
        blockType: 'REPORTER',
        arguments: {}
      }
    ]
});
```

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```
