// SPDX-License-Identifier: MPL-2.0
/** Author-declared extension behaviour, never a browser permission grant. */
export const RESOURCE_TYPES = ['camera', 'microphone', 'network', 'bluetooth', 'usb',
  'storage', 'files', 'audio-output'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ResourceText = Readonly<{en: string; [locale: string]: string}>;
export interface ResourceUse {
  type: ResourceType;
  /** Required by the main feature, or used only by the stated optional path. */
  usage: 'required' | 'conditional';
  purpose: ResourceText;
  condition?: ResourceText;
  /** A chooser may request a resource that the extension immediately releases. */
  access?: 'use' | 'permission-request';
  via?: readonly string[];
  /** Downloading a model and uploading an image must not read as the same thing. */
  data?: {direction: 'download' | 'upload' | 'bidirectional'; content: ResourceText};
}
export interface ResourceDeclaration {
  schemaVersion: 1;
  resources: readonly ResourceUse[];
}

export const RESOURCE_LABELS: Readonly<Record<ResourceType, ResourceText>> = {
  camera: {en: 'Camera', ja: 'カメラ'}, microphone: {en: 'Microphone', ja: 'マイク'},
  network: {en: 'Network', ja: 'ネットワーク'}, bluetooth: {en: 'Bluetooth', ja: 'Bluetooth'},
  usb: {en: 'USB', ja: 'USB'}, storage: {en: 'Browser storage', ja: 'ブラウザ内の保存領域'},
  files: {en: 'Selected files', ja: '選択したファイル'},
  'audio-output': {en: 'Audio output', ja: '音声出力'}
};

/** Original 24-unit drawings shared by HTML and React consumers. */
export const RESOURCE_ICON_PATHS: Readonly<Record<ResourceType, string>> = {
  camera: 'M3 7h4l2-3h6l2 3h4v13H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  microphone: 'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0z M6 10v2a6 6 0 0 0 12 0v-2 M12 18v4 M8 22h8',
  network: 'M5 11h14v10H5z M8 15h8 M8 18h2 M14 18h2 M8 7a6 6 0 0 1 8 0 M4 4a12 12 0 0 1 16 0',
  bluetooth: 'M7 7l10 10-5 5V2l5 5L7 17',
  usb: 'M12 22V3 M9 6l3-3 3 3 M12 17l-6-4V8 M12 13l6-4V5 M4 5h4v3H4z M16 2h4v3h-4z',
  storage: 'M3 5h18v14H3z M3 14h18 M16 17h2 M7 8h10 M7 11h7',
  files: 'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h8',
  'audio-output': 'M3 9h5l6-5v16l-6-5H3z M17 8a6 6 0 0 1 0 8 M20 5a10 10 0 0 1 0 14'
};

function fail(message: string): never { throw new TypeError(`Resource declaration: ${message}`); }
function record(value: unknown, label: string, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const result = value as Record<string, unknown>;
  if (keys && Object.keys(result).some(key => !keys.includes(key))) fail(`${label} has an unknown field`);
  return result;
}
function text(value: unknown, label: string): ResourceText {
  const source = record(value, label);
  if (!Object.hasOwn(source, 'en') || Object.keys(source).length > 12) fail(`${label} requires English text`);
  const result: Record<string, string> = {};
  for (const [locale, value] of Object.entries(source)) {
    if (!/^[a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale) || typeof value !== 'string' ||
        !value.trim() || value.length > 1000 || [...value].length > 500) fail(`${label} must contain bounded localized text`);
    result[locale] = value;
  }
  return Object.freeze(result) as ResourceText;
}

/** Missing means undeclared; an explicit empty list means an author reviewed this version. */
export function parseResourceDeclaration(value: unknown): ResourceDeclaration | undefined {
  if (value === undefined) return undefined;
  const source = record(value, 'declaration', ['schemaVersion', 'resources']);
  if (source['schemaVersion'] !== 1) fail('unsupported schemaVersion');
  const list = source['resources'];
  if (!Array.isArray(list) || list.length > RESOURCE_TYPES.length) fail('resources must be a bounded list');
  const seen = new Set<ResourceType>();
  const resources = list.map((value): ResourceUse => {
    const item = record(value, 'resource', ['type', 'usage', 'purpose', 'condition', 'access', 'via', 'data']);
    const type = item['type'] as ResourceType;
    if (!RESOURCE_TYPES.includes(type) || seen.has(type)) fail('unknown or duplicate resource type');
    seen.add(type);
    const usage = item['usage'];
    if (usage !== 'required' && usage !== 'conditional') fail('usage must be required or conditional');
    const result: ResourceUse = {type, usage, purpose: text(item['purpose'], 'purpose')};
    if (item['condition'] !== undefined) result.condition = text(item['condition'], 'condition');
    if (usage === 'conditional' && !result.condition) fail('conditional use requires a condition');
    if (item['access'] !== undefined) {
      if (item['access'] !== 'use' && item['access'] !== 'permission-request') fail('invalid access');
      result.access = item['access'];
    }
    if (item['via'] !== undefined) {
      const via = item['via'];
      if (!Array.isArray(via) || via.length === 0 || via.length > 8 || new Set(via).size !== via.length ||
          via.some(name => typeof name !== 'string' || name.length > 214 ||
            !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name))) fail('invalid via packages');
      result.via = Object.freeze([...via]) as readonly string[];
    }
    if (item['data'] !== undefined) {
      if (type !== 'network') fail('data is only valid for network');
      const data = record(item['data'], 'data', ['direction', 'content']);
      const direction = data['direction'];
      if (direction !== 'download' && direction !== 'upload' && direction !== 'bidirectional') fail('invalid data direction');
      result.data = Object.freeze({direction, content: text(data['content'], 'data content')});
    }
    if (type === 'network' && !result.data) fail('network requires data direction and content');
    return Object.freeze(result);
  });
  return Object.freeze({schemaVersion: 1, resources: Object.freeze(resources)});
}

/** Read only data shipped by this package; never inspect or execute extension code. */
export function readPackageResourceDeclaration(value: unknown): ResourceDeclaration | undefined {
  const manifest = record(value, 'package manifest');
  if (manifest['turbowarpExtension'] === undefined) return undefined;
  const extension = record(manifest['turbowarpExtension'], 'turbowarpExtension');
  return parseResourceDeclaration(extension['resourceDeclaration']);
}

export function resourceText(value: ResourceText, locale = 'en'): string {
  const tag = locale.replace('_', '-');
  return value[tag] ?? value[tag.split('-')[0]!] ?? value.en;
}
