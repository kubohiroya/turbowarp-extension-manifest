# turbowarp-extension-manifest

[English](README.md) | 日本語

`@kubohiroya/turbowarp-extension-manifest` は、`turbowarp-extension-template` が使う extension manifest 契約を提供します。

TurboWarp extension repository が template から manifest code をコピーせず、同じ deterministic な `dist/extension-manifest.json` 契約を使うためのパッケージです。

## 役割

- `src/block-definitions.json` 形式のdataから deterministic な extension API manifest を作る。
- opcode重複とmenu参照を検証する。
- stable key orderでmanifestをserializeする。
- `turbowarp-extension-template` と同じ JSON Schema を再利用する。
- manifest風のblock定義をTurboWarp `getInfo()`用block定義へ変換し、Scratch type mapping codeのコピーを避ける。

## 例

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

## 開発

```bash
npm install --global corepack@latest
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

## リソース利用の宣言

各機能拡張は `package.json` の `turbowarpExtension.resourceDeclaration` に利用内容を宣言します。`./resources` が型と、拡張コードを実行しない検証APIを提供し、`./resource-declaration.schema.json` がJSON Schemaを公開します。既存のブロック用manifest v1/v2は変更しません。

種類は `camera`・`microphone`・`network`・`bluetooth`・`usb`・`storage`・`files`・`audio-output`。`usage: required` は主要機能に必要、`conditional` は特定の条件で利用する意味です。`purpose` と、条件付きの場合の `condition` は英語を必須とする多言語テキストです。ネットワークには `data.direction`（`download`・`upload`・`bidirectional`）と、多言語の `data.content` を必ず記録します。許可要求後すぐに解放する経路は `access: permission-request` とし、取得後の扱いを用途にも記録します。連携先は `via` のパッケージ名で示します。

未記入は未宣言、`resources: []` は対象版について確認した空の宣言です。安全性の証明とは扱いません。対象はカタログが選ぶ機能拡張の入口です。同梱CLI・別アプリ・ライブラリーヘルパーの動作とは分け、実装の変更時に更新します。共有カメラを読む側もカメラを宣言します。拡張本体やギャラリー画像の取得だけをネットワーク機能とは扱わず、作品のメモリ内データだけを永続ストレージとは扱いません。

追加画面・Plusダッシュボード・作品を開くときの確認で同じ宣言を使います。宣言だけで機器を起動したりブラウザの許可を付与したりしません。表示を戻してから依存を戻す順で切り戻せます。既存manifestのバイト列は維持し、公開済みの同じ版は差し替えません。

## 配布 descriptor

`@kubohiroya/turbowarp-extension-manifest/distribution` は、公開ビルドの静的な
`dist/extension-package.json` を検証します。v1 は拡張 ID、npm パッケージの正確な版、
表示名と説明、ライセンス、実行方式、リソース宣言、同じディレクトリ内の JS と
ブロック API manifest のファイル名・バイト数・SHA-256 を記録します。利用側は取得元を
別に記録し、実ファイルを照合します。リソース宣言とハッシュは実行の承認を与えません。

## 標準ソースビルドの宣言

ソースリポジトリのルートにある `extension-build.json` を
`@kubohiroya/turbowarp-extension-manifest/build-profile` の
`parseExtensionBuildProfile` で読みます。`turbowarp-typescript-v1` は入口、
設定 JSON、ブロック定義、lockfile の位置を固定します。`dependencies: "none"` は
ホストのレシピに npm 依存の解決・インストールを要求しない指定です。lockfile は
開発者自身のビルドの出所を記録するために参照します。

`parseExtensionBuildSettings` は `src/extension-config.json` にある拡張 ID、
表示情報、実行方式を検査します。これらの API は静的データの検証を行います。
ホストの実行環境と拡張の実行承認は別途必要です。

配布成果物の生成・SHA-256照合・正本との整合検証、共通fixture、診断コード、取得元ごとの
root規則は[配布・標準ビルド契約](docs/distribution-contract.ja.md)を参照してください。
`./distribution` の `createExtensionDistribution` と `verifyExtensionDistribution` は
Node・ブラウザーで同じ静的データとバイト列を扱い、拡張コードを実行しません。
