# Changelog

## 0.3.0

- Add extension API manifest format version 2, which carries the metadata a server-side compiler
  needs to lower a block: `resultType`, `effect`, `immutable`, `errors` and `server` per block, and
  `normalizesTo`, `staticLiteral`, `minimum` and `maximum` per argument. `createExtensionManifest`,
  `serializeExtensionManifest` and `extensionManifestPlugin` take `{formatVersion: 2}`; the default
  stays 1 and emits exactly what it emitted before, even when the block definitions already carry
  version 2 metadata.
- Export `EXTENSION_MANIFEST_FORMAT_VERSIONS`, `EXTENSION_MANIFEST_RESULT_TYPES` and
  `EXTENSION_MANIFEST_EFFECTS`. The `effect` vocabulary is the one `turbowarp-http-server`'s compiler
  manifest reader accepts, so a version 2 manifest this package emits is one that reader can parse.
  Three repositories had each narrowed `effect` to a different local subset, and one had added a
  value (`state`) no reader accepts; this replaces all four with one vocabulary.
- Require all five block metadata fields together at version 2. A block carrying only some of them
  produces a manifest the compiler rejects wholesale, so it is refused at generation time instead.
- Add `state` to the `effect` vocabulary, for a block that mutates extension-held data scoped to a
  target. None of the other values describe it: `storage-*` means persistent storage and
  `pure`/`immutable` mean no mutation. `turbowarp-structured-data` was already emitting it.
- Accept the optional extension-level `pathSegmentType` and `dataReferenceType` at version 2, placed
  between `id` and `blocks`. With these and `state` in place, everything
  `turbowarp-structured-data` had put in its own format version 3 fits in version 2.
- Add `jsonText` and `yamlText` to the `resultType` vocabulary, for a string whose content is
  serialized JSON or YAML. `turbowarp-structured-data` was already emitting both, and plain `string`
  does not record the distinction.
- Accept version 2 block metadata through a `blockMetadata` option keyed by opcode, merged over each
  block definition. Block definitions are bundled into the extension JavaScript, so metadata placed
  there would ship to every project that loads the extension even though only the build reads it;
  this keeps it in a build-time file and leaves the bundle byte for byte unchanged.
- Rewrite the JSON Schema as a `oneOf` over version 1 and version 2.

Rollback: pin `@kubohiroya/turbowarp-extension-manifest@0.2.0`. Version 1 output is unchanged, so a
repository that never passes `formatVersion` is unaffected either way.

## 0.2.0

- Add reusable TurboWarp `getInfo()` block and extension info mapping helpers.

## 0.1.0

- Initial manifest builder package.
