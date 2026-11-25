// SPDX-License-Identifier: MPL-2.0

export const BUILD_PROFILE_FILENAME = 'extension-build.json';

export const STANDARD_BUILD_PROFILE = Object.freeze({
  formatVersion: 1,
  profile: 'turbowarp-typescript-v1',
  entry: 'src/index.ts',
  settings: 'src/extension-config.json',
  blocks: 'src/block-definitions.json',
  lockfile: 'pnpm-lock.yaml',
  dependencies: 'none'
} as const);

export type ExtensionBuildProfile = typeof STANDARD_BUILD_PROFILE;

export interface ExtensionBuildSettings {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly license: string;
  readonly unsandboxed: boolean;
  readonly docsURI: string;
  readonly blockIconURI: string;
}

export type BuildProfileErrorCode =
  'UNSUPPORTED_BUILD_PROFILE' | 'INVALID_BUILD_PROFILE' | 'INVALID_BUILD_SETTINGS';

export class BuildProfileError extends Error {
  constructor(readonly code: BuildProfileErrorCode, message: string) {
    super(message);
    this.name = 'BuildProfileError';
  }
}

function object(value: unknown, code: BuildProfileErrorCode): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BuildProfileError(code, 'Expected a JSON object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new BuildProfileError(code, 'Expected a plain JSON object');
  }
  return value as Record<string, unknown>;
}

/** A repository can request the fixed host recipe through static JSON data. */
export function parseExtensionBuildProfile(value: unknown): ExtensionBuildProfile {
  const input = object(value, 'INVALID_BUILD_PROFILE');
  if (input.formatVersion !== STANDARD_BUILD_PROFILE.formatVersion ||
      input.profile !== STANDARD_BUILD_PROFILE.profile) {
    throw new BuildProfileError('UNSUPPORTED_BUILD_PROFILE', 'Unsupported extension build profile');
  }
  const fields = Object.entries(STANDARD_BUILD_PROFILE);
  if (Object.keys(input).length !== fields.length) {
    throw new BuildProfileError('INVALID_BUILD_PROFILE', 'The standard build profile has unexpected fields');
  }
  for (const [field, expected] of fields) {
    if (!Object.hasOwn(input, field) || input[field] !== expected) {
      throw new BuildProfileError('INVALID_BUILD_PROFILE', 'Invalid standard build profile field: ' + field);
    }
  }
  return STANDARD_BUILD_PROFILE;
}

function text(input: Record<string, unknown>, field: string, limit: number, pattern?: RegExp): string {
  const value = input[field];
  if (!Object.hasOwn(input, field) || typeof value !== 'string' || value.length > limit ||
      !value.trim() || /[\u0000-\u001f\u007f]/u.test(value) || (pattern && !pattern.test(value))) {
    throw new BuildProfileError('INVALID_BUILD_SETTINGS', 'Invalid extension setting: ' + field);
  }
  return value;
}

/** Read the extension metadata without loading a publisher-owned module. */
export function parseExtensionBuildSettings(value: unknown): ExtensionBuildSettings {
  const input = object(value, 'INVALID_BUILD_SETTINGS');
  const fields = ['id', 'slug', 'name', 'description', 'author', 'license', 'unsandboxed', 'docsURI', 'blockIconURI'];
  if (Object.keys(input).some(field => !fields.includes(field))) {
    throw new BuildProfileError('INVALID_BUILD_SETTINGS', 'Unexpected extension setting');
  }
  if (!Object.hasOwn(input, 'unsandboxed') || typeof input.unsandboxed !== 'boolean') {
    throw new BuildProfileError('INVALID_BUILD_SETTINGS', 'Extension settings must declare their execution mode');
  }
  const docsURI = text(input, 'docsURI', 2048, /^https:\/\//u);
  const docsURL = URL.parse(docsURI);
  if (!docsURL || docsURL.protocol !== 'https:' || docsURL.username || docsURL.password) {
    throw new BuildProfileError('INVALID_BUILD_SETTINGS', 'Extension documentation requires an HTTPS URL');
  }
  return Object.freeze({
    id: text(input, 'id', 64, /^[A-Za-z0-9]+$/u),
    slug: text(input, 'slug', 64, /^[a-z0-9][a-z0-9-]*$/u),
    name: text(input, 'name', 128),
    description: text(input, 'description', 500),
    author: text(input, 'author', 128),
    license: text(input, 'license', 256),
    unsandboxed: input.unsandboxed,
    docsURI,
    blockIconURI: text(input, 'blockIconURI', 32 * 1024, /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/u)
  });
}
