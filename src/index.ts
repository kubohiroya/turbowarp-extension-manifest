export const EXTENSION_MANIFEST_FORMAT_VERSION = 1 as const;

export const EXTENSION_MANIFEST_FORMAT_VERSIONS = [1, 2] as const;

export type ExtensionManifestFormatVersion = (typeof EXTENSION_MANIFEST_FORMAT_VERSIONS)[number];

/**
 * Format version 2 adds the metadata a server-side compiler needs to lower a block into its own IR.
 *
 * The vocabularies below are the ones `turbowarp-http-server`'s compiler manifest reader accepts, so
 * a manifest this package emits at version 2 is one that reader can parse. Keep them in step: a value
 * added here that the reader rejects produces an extension no server can compile.
 */
export const EXTENSION_MANIFEST_RESULT_TYPES = [
  'json',
  'boolean',
  'number',
  'string',
  'void',
  // A string whose content is serialized JSON or YAML, which `string` alone would not record.
  'jsonText',
  'yamlText'
] as const;

export const EXTENSION_MANIFEST_EFFECTS = [
  'pure',
  'immutable',
  'control',
  'request-read',
  'response-write',
  'storage-read',
  'storage-write',
  'binary-read',
  'binary-write',
  'state'
] as const;

export type ExtensionManifestResultType = (typeof EXTENSION_MANIFEST_RESULT_TYPES)[number];

export type ExtensionManifestEffect = (typeof EXTENSION_MANIFEST_EFFECTS)[number];

export interface ExtensionManifestServer {
  supported: boolean;
  /** Required when `supported` is true; the operation name the server lowers this block to. */
  irOperation?: string;
}

export interface ExtensionManifestArgument {
  id: string;
  type: string;
  menu?: string;
  /** Version 2 only. */
  normalizesTo?: 'pathSegments';
  staticLiteral?: boolean;
  minimum?: number;
  maximum?: number;
}

export interface ExtensionManifestBlock {
  opcode: string;
  blockType: string;
  arguments: ExtensionManifestArgument[];
  /** Version 2 only, and then all five are required. */
  resultType?: ExtensionManifestResultType;
  effect?: ExtensionManifestEffect;
  immutable?: boolean;
  errors?: string[];
  server?: ExtensionManifestServer;
}

/**
 * The version 2 metadata of one block, as `blockMetadata` carries it.
 *
 * The block type models these as optional, because a version 1 block has none of them. A caller
 * building the `blockMetadata` map needs them all, so it gets its own type rather than having to
 * write `Required<Pick<ExtensionManifestBlock, ...>>` itself.
 */
export type ExtensionManifestBlockMetadata = Required<
  Pick<ExtensionManifestBlock, 'effect' | 'errors' | 'immutable' | 'resultType' | 'server'>
>;

export interface ExtensionManifestMenu {
  id: string;
  acceptReporters: boolean;
}

export interface ExtensionManifestPathSegmentType {
  kind: 'discriminatedUnion';
  variants: {kind: string; valueType: string}[];
}

export interface ExtensionManifestDataReferenceType {
  kind: string;
  scope: string;
  lifetime: string;
  valueType: string;
}

export interface ExtensionManifest {
  formatVersion: ExtensionManifestFormatVersion;
  id: string;
  /** Version 2 only: how a compiler should read the path arguments this extension takes. */
  pathSegmentType?: ExtensionManifestPathSegmentType;
  /** Version 2 only: what the values this extension hands out refer to, and for how long. */
  dataReferenceType?: ExtensionManifestDataReferenceType;
  blocks: ExtensionManifestBlock[];
  menus: ExtensionManifestMenu[];
}

export interface CreateExtensionManifestOptions {
  /** Defaults to 1. Version 2 requires compiler metadata on every block. */
  formatVersion?: ExtensionManifestFormatVersion;
  /**
   * Version 2 block metadata keyed by opcode, merged over each block definition.
   *
   * Block definitions are bundled into the extension JavaScript, so metadata added there would ship
   * to every project that loads the extension even though only the build reads it. Keeping it in a
   * separate build-time file and passing it here leaves the bundle untouched.
   */
  // Deliberately not typed as ExtensionManifestBlockMetadata: the metadata usually arrives from a
  // JSON import, which TypeScript widens to `string`, and every field is validated at run time
  // anyway. The exported type is there for callers that build the map in TypeScript.
  blockMetadata?: Readonly<Record<string, unknown>>;
}

export interface ExtensionManifestPluginOptions extends CreateExtensionManifestOptions {
  id: string;
  definitions: unknown;
  fileName?: string;
}

export interface ExtensionManifestPlugin {
  name: 'extension-api-manifest';
  apply: 'build';
  enforce: 'post';
  generateBundle(this: {emitFile(file: {type: 'asset'; fileName: string; source: string}): void}): void;
}

export interface TurboWarpScratchBlockBoundary {
  ArgumentType: Readonly<Record<string, string>>;
  BlockType: Readonly<Record<string, string>>;
}

export interface TurboWarpBlockArgumentDefinition {
  type: string;
  defaultValue?: unknown;
  menu?: string;
}

export interface TurboWarpBlockDefinition {
  opcode: string;
  blockType: string;
  text: string;
  arguments?: Readonly<Record<string, TurboWarpBlockArgumentDefinition>>;
}

export interface TurboWarpExtensionInfoSource {
  id: string;
  name: string;
  blocks: readonly TurboWarpBlockDefinition[];
  menus?: Readonly<Record<string, unknown>>;
}

export interface TurboWarpBlockDefinitionOptions {
  hideFromPalette?: boolean;
  disableReporterMonitors?: boolean;
  decorateBlock?(
    definition: TurboWarpBlockDefinition,
    mapped: Readonly<Record<string, unknown>>
  ): Readonly<Record<string, unknown>>;
}

export interface TurboWarpExtensionInfoOptions extends TurboWarpBlockDefinitionOptions {
  blockIconURI?: string;
  color1?: string;
  color2?: string;
  color3?: string;
  description?: string;
  docsURI?: string;
  creator?: string;
  license?: string;
  credits?: string;
}

export function createExtensionManifest(
  id: string,
  definitions: unknown,
  options: CreateExtensionManifestOptions = {}
): ExtensionManifest {
  if (!/^[a-z0-9]+$/u.test(id)) {
    throw new TypeError('Extension manifest ID must contain only lowercase letters and numbers.');
  }

  const formatVersion = options.formatVersion ?? EXTENSION_MANIFEST_FORMAT_VERSION;
  if (!EXTENSION_MANIFEST_FORMAT_VERSIONS.includes(formatVersion)) {
    throw new TypeError(
      `Unsupported extension manifest format version: ${String(formatVersion)}. Supported: ${EXTENSION_MANIFEST_FORMAT_VERSIONS.join(', ')}.`
    );
  }

  const source = requireRecord(definitions, 'Block definitions');
  const sourceBlocks = source['blocks'];
  if (!Array.isArray(sourceBlocks)) {
    throw new TypeError('Block definitions must contain a blocks array.');
  }

  const menus = normalizeMenus(source['menus']);
  const menuIds = new Set(menus.map((menu) => menu.id));
  const seenOpcodes = new Set<string>();
  const blocks = sourceBlocks.map((block, index) => {
    const normalized = normalizeBlock(
      block,
      index,
      menuIds,
      formatVersion,
      options.blockMetadata
    );
    if (seenOpcodes.has(normalized.opcode)) {
      throw new TypeError(`Duplicate block opcode: ${normalized.opcode}`);
    }
    seenOpcodes.add(normalized.opcode);
    return normalized;
  });

  return {
    formatVersion,
    id,
    ...(formatVersion === 1 ? {} : extensionTypes(source)),
    blocks: blocks.sort((left, right) => compareIds(left.opcode, right.opcode)),
    menus
  };
}

function extensionTypes(source: Record<string, unknown>): Partial<ExtensionManifest> {
  const types: Partial<ExtensionManifest> = {};
  const pathSegmentType = source['pathSegmentType'];
  if (pathSegmentType !== undefined) {
    const record = requireRecord(pathSegmentType, 'pathSegmentType');
    if (record['kind'] !== 'discriminatedUnion') {
      throw new TypeError('pathSegmentType kind must be discriminatedUnion.');
    }
    const variants = record['variants'];
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new TypeError('pathSegmentType variants must be a non-empty array.');
    }
    types.pathSegmentType = {
      kind: 'discriminatedUnion',
      variants: variants.map((variant, index) => {
        const entry = requireRecord(variant, `pathSegmentType variants[${index}]`);
        return {
          kind: requireNonEmptyString(entry['kind'], `pathSegmentType variants[${index}] kind`),
          valueType: requireNonEmptyString(
            entry['valueType'],
            `pathSegmentType variants[${index}] valueType`
          )
        };
      })
    };
  }
  const dataReferenceType = source['dataReferenceType'];
  if (dataReferenceType !== undefined) {
    const record = requireRecord(dataReferenceType, 'dataReferenceType');
    types.dataReferenceType = {
      kind: requireNonEmptyString(record['kind'], 'dataReferenceType kind'),
      scope: requireNonEmptyString(record['scope'], 'dataReferenceType scope'),
      lifetime: requireNonEmptyString(record['lifetime'], 'dataReferenceType lifetime'),
      valueType: requireNonEmptyString(record['valueType'], 'dataReferenceType valueType')
    };
  }
  return types;
}

export function createTurboWarpBlockDefinitions(
  Scratch: TurboWarpScratchBlockBoundary,
  definitions: readonly TurboWarpBlockDefinition[],
  options: TurboWarpBlockDefinitionOptions = {}
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  if (!isScratchBoundary(Scratch)) {
    throw new TypeError('TurboWarp block definitions require ArgumentType and BlockType.');
  }
  if (!Array.isArray(definitions)) {
    throw new TypeError('TurboWarp block definitions must be an array.');
  }
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError('TurboWarp block definition options must be an object.');
  }
  const decorateBlock = options.decorateBlock;
  if (decorateBlock !== undefined && typeof decorateBlock !== 'function') {
    throw new TypeError('decorateBlock must be a function.');
  }
  const blocks = definitions.map((definition, index) => {
    const source = normalizeRuntimeBlockDefinition(definition, index);
    const blockType = Scratch.BlockType[source.blockType];
    if (typeof blockType !== 'string') {
      throw new TypeError(`Scratch.BlockType.${source.blockType} is required.`);
    }
    const mapped = {
      opcode: source.opcode,
      blockType,
      text: source.text,
      ...(options.hideFromPalette === true ? {hideFromPalette: true} : {}),
      ...(options.disableReporterMonitors === true && source.blockType === 'REPORTER'
        ? {disableMonitor: true}
        : {}),
      arguments: Object.fromEntries(
        Object.entries(source.arguments ?? {}).map(([name, argument]) => {
          const type = Scratch.ArgumentType[argument.type];
          if (typeof type !== 'string') {
            throw new TypeError(`Scratch.ArgumentType.${argument.type} is required.`);
          }
          return [
            name,
            {
              type,
              ...(argument.defaultValue === undefined ? {} : {defaultValue: argument.defaultValue}),
              ...(argument.menu === undefined ? {} : {menu: argument.menu})
            }
          ];
        })
      )
    };
    return Object.freeze({
      ...mapped,
      ...(decorateBlock?.(source, mapped) ?? {})
    });
  });
  return Object.freeze(blocks);
}

export function createTurboWarpExtensionInfo(
  Scratch: TurboWarpScratchBlockBoundary,
  source: TurboWarpExtensionInfoSource,
  options: TurboWarpExtensionInfoOptions = {}
): Readonly<Record<string, unknown>> {
  const manifest = requireRecord(source, 'TurboWarp extension info source');
  const id = requireNonEmptyString(manifest['id'], 'TurboWarp extension id');
  const name = requireNonEmptyString(manifest['name'], 'TurboWarp extension name');
  const blocks = manifest['blocks'];
  if (!Array.isArray(blocks)) throw new TypeError('TurboWarp extension blocks must be an array.');
  const optional = Object.fromEntries(
    [
      'blockIconURI',
      'color1',
      'color2',
      'color3',
      'description',
      'docsURI',
      'creator',
      'license',
      'credits'
    ]
      .map((key) => [key, options[key as keyof TurboWarpExtensionInfoOptions]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
  return Object.freeze({
    id,
    name,
    ...optional,
    blocks: createTurboWarpBlockDefinitions(Scratch, blocks, options),
    ...(manifest['menus'] === undefined ? {} : {menus: manifest['menus']})
  });
}

export function serializeExtensionManifest(
  id: string,
  definitions: unknown,
  options: CreateExtensionManifestOptions = {}
): string {
  return `${JSON.stringify(createExtensionManifest(id, definitions, options), null, 2)}\n`;
}

export function extensionManifestPlugin(
  options: ExtensionManifestPluginOptions
): ExtensionManifestPlugin {
  return {
    name: 'extension-api-manifest',
    apply: 'build',
    enforce: 'post',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: options.fileName ?? 'extension-manifest.json',
        source: serializeExtensionManifest(options.id, options.definitions, {
          ...(options.formatVersion === undefined ? {} : {formatVersion: options.formatVersion}),
          ...(options.blockMetadata === undefined ? {} : {blockMetadata: options.blockMetadata})
        })
      });
    }
  };
}

function normalizeBlock(
  value: unknown,
  index: number,
  menuIds: ReadonlySet<string>,
  formatVersion: ExtensionManifestFormatVersion,
  blockMetadata: Readonly<Record<string, unknown>> | undefined
): ExtensionManifestBlock {
  const definition = requireRecord(value, `Block at index ${index}`);
  const opcode = requireNonEmptyString(definition['opcode'], `Block at index ${index} opcode`);
  const extra = blockMetadata?.[opcode];
  const block =
    extra === undefined
      ? definition
      : {...definition, ...requireRecord(extra, `Block ${opcode} metadata`)};
  const blockType = requireNonEmptyString(block['blockType'], `Block ${opcode} blockType`);
  const sourceArguments = block['arguments'] ?? {};
  const argumentRecord = requireRecord(sourceArguments, `Block ${opcode} arguments`);
  const argumentsList = Object.entries(argumentRecord).map(([argumentId, argument]) => {
    requireNonEmptyString(argumentId, `Block ${opcode} argument ID`);
    const definition = requireRecord(argument, `Block ${opcode} argument ${argumentId}`);
    const type = requireNonEmptyString(definition['type'], `Block ${opcode} argument ${argumentId} type`);
    const menu = definition['menu'];
    if (menu !== undefined && (typeof menu !== 'string' || !menuIds.has(menu))) {
      throw new TypeError(`Block ${opcode} argument ${argumentId} references unknown menu: ${menu}`);
    }
    const base: ExtensionManifestArgument =
      menu === undefined ? {id: argumentId, type} : {id: argumentId, type, menu};
    return formatVersion === 1
      ? base
      : withArgumentConstraints(base, definition, `Block ${opcode} argument ${argumentId}`);
  });

  const normalized: ExtensionManifestBlock = {
    opcode,
    blockType,
    arguments: argumentsList.sort((left, right) => compareIds(left.id, right.id))
  };
  // Version 1 emits nothing beyond the three keys, so a repository that pins version 1 keeps its
  // existing manifest byte for byte even when its block definitions already carry version 2 metadata.
  return formatVersion === 1 ? normalized : withCompilerMetadata(normalized, block);
}

/**
 * Version 2 requires all five metadata fields on every block. Accepting a block that carries only
 * some of them would emit a manifest the compiler rejects wholesale, so demand them here instead.
 */
function withCompilerMetadata(
  block: ExtensionManifestBlock,
  definition: Record<string, unknown>
): ExtensionManifestBlock {
  const label = `Block ${block.opcode}`;
  for (const key of ['resultType', 'effect', 'immutable', 'errors', 'server'] as const) {
    if (definition[key] === undefined) {
      throw new TypeError(`${label} must declare ${key} for format version 2.`);
    }
  }

  const resultType = requireEnum(
    definition['resultType'],
    EXTENSION_MANIFEST_RESULT_TYPES,
    `${label} resultType`
  );
  const effect = requireEnum(definition['effect'], EXTENSION_MANIFEST_EFFECTS, `${label} effect`);
  const immutable = definition['immutable'];
  if (typeof immutable !== 'boolean') {
    throw new TypeError(`${label} immutable must be a boolean.`);
  }
  const rawErrors = definition['errors'];
  if (!Array.isArray(rawErrors)) {
    throw new TypeError(`${label} errors must be an array.`);
  }
  // Error codes stay in their declared order: they read as a documented list, not a set.
  const errors = rawErrors.map((error, errorIndex) =>
    requireNonEmptyString(error, `${label} errors[${errorIndex}]`)
  );

  return {...block, resultType, effect, immutable, errors, server: normalizeServer(definition['server'], label)};
}

function normalizeServer(value: unknown, label: string): ExtensionManifestServer {
  const server = requireRecord(value, `${label} server`);
  const supported = server['supported'];
  if (typeof supported !== 'boolean') {
    throw new TypeError(`${label} server.supported must be a boolean.`);
  }
  const irOperation = server['irOperation'];
  if (irOperation === undefined) {
    if (supported) {
      throw new TypeError(`${label} server.irOperation is required when supported is true.`);
    }
    return {supported};
  }
  return {supported, irOperation: requireNonEmptyString(irOperation, `${label} server.irOperation`)};
}

function withArgumentConstraints(
  argument: ExtensionManifestArgument,
  definition: Record<string, unknown>,
  label: string
): ExtensionManifestArgument {
  const normalizesTo = definition['normalizesTo'];
  if (normalizesTo !== undefined && normalizesTo !== 'pathSegments') {
    throw new TypeError(`${label} normalizesTo must be pathSegments.`);
  }
  const staticLiteral = definition['staticLiteral'];
  if (staticLiteral !== undefined && typeof staticLiteral !== 'boolean') {
    throw new TypeError(`${label} staticLiteral must be a boolean.`);
  }
  return {
    ...argument,
    ...(normalizesTo === undefined ? {} : {normalizesTo}),
    ...(staticLiteral === undefined ? {} : {staticLiteral}),
    ...requireOptionalFiniteNumber(definition['minimum'], 'minimum', label),
    ...requireOptionalFiniteNumber(definition['maximum'], 'maximum', label)
  };
}

function requireOptionalFiniteNumber(
  value: unknown,
  key: 'minimum' | 'maximum',
  label: string
): Record<string, number> {
  if (value === undefined) return {};
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} ${key} must be a finite number.`);
  }
  return {[key]: value};
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new TypeError(`${label} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function normalizeMenus(value: unknown): ExtensionManifestMenu[] {
  const menuRecord = requireRecord(value ?? {}, 'Block definition menus');
  return Object.entries(menuRecord)
    .map(([id, menu]) => {
      requireNonEmptyString(id, 'Menu ID');
      const definition = requireRecord(menu, `Menu ${id}`);
      const acceptReporters = definition['acceptReporters'] ?? false;
      if (typeof acceptReporters !== 'boolean') {
        throw new TypeError(`Menu ${id} acceptReporters must be a boolean.`);
      }
      return {id, acceptReporters};
    })
    .sort((left, right) => compareIds(left.id, right.id));
}

function normalizeRuntimeBlockDefinition(value: unknown, index: number): TurboWarpBlockDefinition {
  const block = requireRecord(value, `TurboWarp block at index ${index}`);
  const opcode = requireNonEmptyString(block['opcode'], `TurboWarp block at index ${index} opcode`);
  const blockType = requireNonEmptyString(block['blockType'], `TurboWarp block ${opcode} blockType`);
  const text = requireNonEmptyString(block['text'], `TurboWarp block ${opcode} text`);
  const sourceArguments = block['arguments'] ?? {};
  const argumentRecord = requireRecord(sourceArguments, `TurboWarp block ${opcode} arguments`);
  const arguments_: Record<string, TurboWarpBlockArgumentDefinition> = {};
  for (const [name, argument] of Object.entries(argumentRecord)) {
    requireNonEmptyString(name, `TurboWarp block ${opcode} argument ID`);
    const definition = requireRecord(argument, `TurboWarp block ${opcode} argument ${name}`);
    const type = requireNonEmptyString(definition['type'], `TurboWarp block ${opcode} argument ${name} type`);
    const menu = definition['menu'];
    if (menu !== undefined && typeof menu !== 'string') {
      throw new TypeError(`TurboWarp block ${opcode} argument ${name} menu must be a string.`);
    }
    arguments_[name] = {
      type,
      ...(definition['defaultValue'] === undefined ? {} : {defaultValue: definition['defaultValue']}),
      ...(menu === undefined ? {} : {menu})
    };
  }
  return {opcode, blockType, text, arguments: arguments_};
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function isScratchBoundary(value: unknown): value is TurboWarpScratchBlockBoundary {
  return isRecord(value) && isRecord(value['ArgumentType']) && isRecord(value['BlockType']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value;
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
