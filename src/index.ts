export const EXTENSION_MANIFEST_FORMAT_VERSION = 1 as const;

export interface ExtensionManifestArgument {
  id: string;
  type: string;
  menu?: string;
}

export interface ExtensionManifestBlock {
  opcode: string;
  blockType: string;
  arguments: ExtensionManifestArgument[];
}

export interface ExtensionManifestMenu {
  id: string;
  acceptReporters: boolean;
}

export interface ExtensionManifest {
  formatVersion: typeof EXTENSION_MANIFEST_FORMAT_VERSION;
  id: string;
  blocks: ExtensionManifestBlock[];
  menus: ExtensionManifestMenu[];
}

export interface ExtensionManifestPluginOptions {
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

export function createExtensionManifest(id: string, definitions: unknown): ExtensionManifest {
  if (!/^[a-z0-9]+$/u.test(id)) {
    throw new TypeError('Extension manifest ID must contain only lowercase letters and numbers.');
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
    const normalized = normalizeBlock(block, index, menuIds);
    if (seenOpcodes.has(normalized.opcode)) {
      throw new TypeError(`Duplicate block opcode: ${normalized.opcode}`);
    }
    seenOpcodes.add(normalized.opcode);
    return normalized;
  });

  return {
    formatVersion: EXTENSION_MANIFEST_FORMAT_VERSION,
    id,
    blocks: blocks.sort((left, right) => compareIds(left.opcode, right.opcode)),
    menus
  };
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

export function serializeExtensionManifest(id: string, definitions: unknown): string {
  return `${JSON.stringify(createExtensionManifest(id, definitions), null, 2)}\n`;
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
        source: serializeExtensionManifest(options.id, options.definitions)
      });
    }
  };
}

function normalizeBlock(
  value: unknown,
  index: number,
  menuIds: ReadonlySet<string>
): ExtensionManifestBlock {
  const block = requireRecord(value, `Block at index ${index}`);
  const opcode = requireNonEmptyString(block['opcode'], `Block at index ${index} opcode`);
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
    return menu === undefined ? {id: argumentId, type} : {id: argumentId, type, menu};
  });

  return {
    opcode,
    blockType,
    arguments: argumentsList.sort((left, right) => compareIds(left.id, right.id))
  };
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
