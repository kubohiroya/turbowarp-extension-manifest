# turbowarp-extension-manifest

[English](README.md)

`@kubohiroya/turbowarp-extension-manifest` は、`turbowarp-extension-template` が使う extension manifest 契約を提供します。

TurboWarp extension repository が template から manifest code をコピーせず、同じ deterministic な `dist/extension-manifest.json` 契約を使うためのパッケージです。

## 役割

- `src/block-definitions.json` 形式のdataから deterministic な extension API manifest を作る。
- opcode重複とmenu参照を検証する。
- stable key orderでmanifestをserializeする。
- `turbowarp-extension-template` と同じ JSON Schema を再利用する。

## 例

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

## 開発

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```
