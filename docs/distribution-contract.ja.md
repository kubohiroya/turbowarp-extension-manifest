# 外部拡張の配布・標準ビルド契約

対象: [Issue #11](https://github.com/kubohiroya/turbowarp-extension-manifest/issues/11)。Template、sb3-toolchain、Loader、UI は本パッケージの型・reader・generatorを共有する。ブロック API manifest v1/v2 と resourceDeclaration の語彙・検証処理を再利用する。

## 配置と基準ディレクトリ

| 入力 | ホストが確定するルート | descriptor | JS/API の相対基準 |
| --- | --- | --- | --- |
| npm tarball | package/ を取り除いたパッケージルート | dist/extension-package.json | descriptor のディレクトリ |
| Release アーカイブ | ホストが選択した配布ルート | dist/extension-package.json | 同上 |
| GitHub ソース | resolved commit の checkout ルート | ビルド後の dist/extension-package.json | 同上 |
| ローカル開発 | 承認した開発ディレクトリ | ビルド後の dist/extension-package.json | 同上 |

bundle.file は JS の basename、api.file は extension-manifest.json に固定する。絶対パス、URL、ディレクトリ区切り、上位参照、percent encoding、query、fragment を受理しない。アーカイブ自体の root 決定、重複entry、symlink、展開先逸脱、容量制限は取得ホストが検証する。basename の検証だけでアーカイブやファイルシステムを安全に扱えるとは解釈しない。

extension-build.json はソースルートに配置し、固定プロファイルは次の JSON と完全一致する。

```json
{
  "formatVersion": 1,
  "profile": "turbowarp-typescript-v1",
  "entry": "src/index.ts",
  "settings": "src/extension-config.json",
  "blocks": "src/block-definitions.json",
  "lockfile": "pnpm-lock.yaml",
  "dependencies": "none"
}
```

profile ID の v1 がホスト所有の TypeScript ビルドレシピを選ぶ。ホストは対応を確認し、実際の compiler/bundler の版と lockfile の hash を build receipt に記録する。宣言から toolchain のダウンロード・依存インストール・shell・plugin・eval・外部設定 module の読み込みへ分岐しない。dependencies: none はホストレシピに npm 依存の解決・インストールを要求しない意味であり、開発者の lockfile に devDependencies がないという主張ではない。ビルド実行環境の隔離や import 制限は sb3-toolchain/Desktop の責務で、この reader は実装しない。

## 公開入口と利用例

| 公開入口 | 用途 |
| --- | --- |
| パッケージルート | 既存 createExtensionManifest と追加 parseExtensionManifest |
| ./distribution | ExtensionDistribution、DistributionArtifact、DistributionBytes、VerifiedExtensionDistribution、DistributionErrorCode と以下の関数 |
| ./build-profile | 固定 profile/settings の型と既存 reader |
| ./resources | リソース宣言の既存の型と reader |
| ./extension-package.schema.json | 配布 v1 の JSON Schema |
| ./extension-build.schema.json | 固定 profile の JSON Schema |
| ./resource-declaration.schema.json | リソース宣言の JSON Schema |

Template は静的な package/settings の正本と最終成果物から生成する。リソース宣言の正本は package.json の turbowarpExtension.resourceDeclaration。descriptor の resources はそのスナップショットとする。

```ts
import {createExtensionDistribution} from '@kubohiroya/turbowarp-extension-manifest/distribution';

// Metadata inputs are JSON.parse results; artifacts are Uint8Array values.
const descriptor = await createExtensionDistribution(
  packageJson, extensionConfigJson, {file: 'sample.js', bytes: bundleBytes}, apiBytes
);
const descriptorJson = JSON.stringify(descriptor, null, 2) + '\n';
```

Node とブラウザーは同じ入口・Web Crypto の SHA-256・UTF-8 decoder を使う。ブラウザーは Web Crypto を使える secure context が必要。reader 自体に Node 専用 import、fetch、外部コードの import/eval はない。入力は JSON をデータとして parse したものとし、拡張の config.ts、bundle-module、package.json の exports/scripts を実行して metadata を得ない。

```ts
import {
  verifyExtensionDistribution, assertDistributionPackage, assertDistributionSettings
} from '@kubohiroya/turbowarp-extension-manifest/distribution';
import {parseExtensionBuildProfile} from '@kubohiroya/turbowarp-extension-manifest/build-profile';

const verified = await verifyExtensionDistribution(descriptorJsonData, {
  bundle: bundleBytes, api: apiBytes
});
// Compare canonical inputs whenever the selected distribution/source supplies them.
assertDistributionPackage(verified.distribution, packageJson);
assertDistributionSettings(verified.distribution, extensionConfigJson);
const profile = parseExtensionBuildProfile(buildProfileJson);
// The host retains verified.bytes and separately decides whether/how to register the extension.
```

verifyExtensionDistribution はサイズ・hash を検証し、API JSON の構造・ID を確認する。返された bytes は呼び出し元の入力から分離したスナップショット。ホストはこれを保持し、実行時に別の未検証ファイルを再取得しない。Uint8Array の内容は変更可能なので、以後の書き換えをホストが防ぐ。package の名前・正確な版・license・resources と、設定の ID・表示名・説明・license・実行方式を照合する。package/settings を提供しない配布形態では、その正本との照合を行ったとは表示しない。

assertDistributionApi は従来の ID 比較に加えて必須フィールド、重複 opcode/menu/argument、menu参照、v2 metadata を確認し、不完全な API manifest を拒否する。parseExtensionManifest は既存 writer と同じ検証・並び順を使う。writer の出力は変更しない。

## 構造化診断

| error.code | 拒否する条件 |
| --- | --- |
| UNSUPPORTED_DESCRIPTOR | 未対応の配布契約版 |
| INVALID_DESCRIPTOR | 欠落・不正・未知フィールド、曖昧なパスや実行方式 |
| INVALID_RESOURCES | 宣言の欠落、不正な版・種類・重複・用途・条件・通信内容 |
| API_MISMATCH | API の ID・版・構造・参照・重複・JSON/UTF-8 が不正 |
| PACKAGE_MISMATCH | 正本の package 名・版・license・resources と不一致 |
| SETTINGS_MISMATCH | 設定が不正、または ID・表示情報・license・sandbox 条件が不一致 |
| SIZE_MISMATCH / HASH_MISMATCH | 成果物のバイト数 / SHA-256 が不一致 |
| UNSUPPORTED_BUILD_PROFILE | 未対応のビルド契約版・profile ID |
| INVALID_BUILD_PROFILE / INVALID_BUILD_SETTINGS | 固定パス以外、追加 shell/plugin/eval、設定の不備 |

parseExtensionManifest 単独では TypeError を返し、配布 reader が API_MISMATCH に包む。parseExtensionBuildSettings 単独の INVALID_BUILD_SETTINGS は、配布との照合では SETTINGS_MISMATCH に包む。空の宣言 resources: [] と欠落を区別し、欠落を「権限不要」と扱わない。

## 取得元と実行条件

descriptor は作者の自己申告。npm の実際に解決した名前・exact version、Release asset ID/hash、resolved commit、取得元 lock、build receipt、開発 session の記録は sb3-toolchain/ホストが保持し、作者 metadata の値で上書きしない。ホストは npm の解決結果と descriptor の名前・版も別途照合する。作者名・npm scope・カタログ掲載の有無を導入条件にしない。

hash、宣言、profile 対応は無害性の証明や権限付与ではない。sandbox、更新・失効、開発 session の開始・取消、権限拡大の判断は Loader/UI/Desktop が所有する。Web は公開済み成果物のみ扱う。

## 受け入れ確認と切り戻し

共通fixtureは tests/fixtures/distribution/。sources.json はホスト側観測の例を descriptor と分離し、npm/Release/repo/local で同じ成果物を使う。JS fixture は実行すると失敗する。Node の対象テストで生成・整合・改ざん・パス逸脱・v1/v2 の互換性を確認する。

tests/distribution-parity.mjs の checkDistributionParity(load) は、ビルド済み dist/ を使い、Node のファイル読み取りとヘッドレスブラウザーの fetch で同じ4正常ケース・12拒否ケースを再生できる。build profile の shell/plugin/eval 拒否も両環境で確認する。

新しい契約版・profile を追加するときは schema、型、診断、fixture を同時更新し、未対応 reader が停止することを確認する。既存 v1 の必須キーや固定パスを黙って変更しない。自動取得・ビルド・実行は追加しないため、本変更に実行用フィーチャーフラグはない。

切り戻しは利用ホストの追加導入経路を停止して依存を前版へ戻す。保存済み作品・取得元記録・旧 API manifest を削除せず、未対応版を旧版として黙って読み直さない。
