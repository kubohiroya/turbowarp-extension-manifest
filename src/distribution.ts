// SPDX-License-Identifier: MPL-2.0
import {parseResourceDeclaration, readPackageResourceDeclaration, type ResourceDeclaration} from './resources.js';
import {parseExtensionManifest, type ExtensionManifest} from './index.js';
import {parseExtensionBuildSettings} from './build-profile.js';

export const DISTRIBUTION_DESCRIPTOR = 'extension-package.json';
export const API_MANIFEST = 'extension-manifest.json';
export const EXACT_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
export const NPM_PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;

export interface DistributionArtifact {
  readonly file: string;
  readonly size: number;
  readonly sha256: string;
}

export interface ExtensionDistribution {
  readonly formatVersion: 1;
  readonly id: string;
  readonly package: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly license: string;
  readonly execution: 'sandboxed' | 'unsandboxed';
  readonly resources: ResourceDeclaration;
  readonly bundle: DistributionArtifact;
  readonly api: DistributionArtifact;
}

export type DistributionErrorCode = 'INVALID_DESCRIPTOR' | 'UNSUPPORTED_DESCRIPTOR' |
  'INVALID_RESOURCES' | 'API_MISMATCH' | 'PACKAGE_MISMATCH' | 'SETTINGS_MISMATCH' |
  'SIZE_MISMATCH' | 'HASH_MISMATCH';

export interface DistributionBytes {
  readonly bundle: Uint8Array;
  readonly api: Uint8Array;
}

export class DistributionError extends Error {
  constructor(readonly code: DistributionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DistributionError';
  }
}

function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.includes(key))) {
    throw new DistributionError('INVALID_DESCRIPTOR', 'Invalid distribution metadata fields');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string, max: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length > max || !value.trim() ||
      /[\u0000-\u001f\u007f]/u.test(value) || (pattern && !pattern.test(value))) {
    throw new DistributionError('INVALID_DESCRIPTOR', 'Invalid distribution field: ' + field);
  }
  return value;
}

function artifact(value: unknown, filename: RegExp): DistributionArtifact {
  const item = record(value, ['file', 'size', 'sha256']);
  if (typeof item.size !== 'number' || !Number.isSafeInteger(item.size) || item.size <= 0) {
    throw new DistributionError('INVALID_DESCRIPTOR', 'Invalid distribution artifact size');
  }
  return Object.freeze({
    file: string(item.file, 'artifact file', 128, filename), size: item.size,
    sha256: string(item.sha256, 'artifact SHA-256', 64, /^[a-f0-9]{64}$/u)
  });
}

/** Read static metadata. Artifact basenames are relative to the descriptor's own directory. */
export function parseExtensionDistribution(value: unknown): ExtensionDistribution {
  const item = record(value, ['formatVersion', 'id', 'package', 'version', 'name', 'description',
    'license', 'execution', 'resources', 'bundle', 'api']);
  if (item.formatVersion !== 1) throw new DistributionError('UNSUPPORTED_DESCRIPTOR', 'Unsupported distribution format');
  if (item.execution !== 'sandboxed' && item.execution !== 'unsandboxed') {
    throw new DistributionError('INVALID_DESCRIPTOR', 'Invalid distribution execution mode');
  }
  let resources: ResourceDeclaration | undefined;
  try {
    resources = parseResourceDeclaration(item.resources);
  } catch (cause) {
    throw new DistributionError('INVALID_RESOURCES', 'Invalid distribution resource declaration', {cause});
  }
  if (!resources) throw new DistributionError('INVALID_RESOURCES', 'Missing distribution resource declaration');
  return Object.freeze({
    formatVersion: 1,
    id: string(item.id, 'extension ID', 64, /^[A-Za-z0-9]+$/u),
    package: string(item.package, 'package name', 214, NPM_PACKAGE),
    version: string(item.version, 'package version', 128, EXACT_VERSION),
    name: string(item.name, 'display name', 128),
    description: string(item.description, 'description', 500),
    license: string(item.license, 'license', 256),
    execution: item.execution,
    resources,
    bundle: artifact(item.bundle, /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.js$/u),
    api: artifact(item.api, /^extension-manifest\.json$/u)
  });
}

export function assertDistributionApi(distribution: ExtensionDistribution, api: unknown): void {
  readDistributionApi(distribution, api);
}

function readDistributionApi(distribution: ExtensionDistribution, api: unknown): ExtensionManifest {
  try {
    const manifest = parseExtensionManifest(api);
    if (manifest.id !== distribution.id) throw new TypeError('Different extension ID');
    return manifest;
  } catch (cause) {
    throw new DistributionError('API_MISMATCH', 'The block API manifest does not match the distribution', {cause});
  }
}

/** Compare JSON values independent of object key order. Array order remains significant. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Check the canonical package data when available; never load its scripts or exports. */
export function assertDistributionPackage(distribution: ExtensionDistribution, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DistributionError('PACKAGE_MISMATCH', 'Missing package metadata');
  }
  const pkg = value as Record<string, unknown>;
  if (pkg.name !== distribution.package || pkg.version !== distribution.version || pkg.license !== distribution.license) {
    throw new DistributionError('PACKAGE_MISMATCH', 'Package name, version or license differs from the distribution');
  }
  let resources: ResourceDeclaration | undefined;
  try {
    resources = readPackageResourceDeclaration(pkg);
  } catch (cause) {
    throw new DistributionError('INVALID_RESOURCES', 'Invalid package resource declaration', {cause});
  }
  if (!resources) throw new DistributionError('INVALID_RESOURCES', 'Missing package resource declaration');
  if (canonical(resources) !== canonical(distribution.resources)) {
    throw new DistributionError('PACKAGE_MISMATCH', 'Package resource declaration differs from the distribution');
  }
}

/** Check the static build settings using the existing fixed-profile reader. */
export function assertDistributionSettings(distribution: ExtensionDistribution, value: unknown): void {
  try {
    const settings = parseExtensionBuildSettings(value);
    if (settings.id !== distribution.id || settings.name !== distribution.name ||
        settings.description !== distribution.description || settings.license !== distribution.license ||
        settings.unsandboxed !== (distribution.execution === 'unsandboxed')) {
      throw new TypeError('Extension settings differ from the distribution');
    }
  } catch (cause) {
    throw new DistributionError('SETTINGS_MISMATCH', 'Invalid or inconsistent extension build settings', {cause});
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Verify a caller-supplied byte snapshot. This does not fetch or execute the artifact. */
export async function verifyDistributionArtifact(expected: DistributionArtifact, bytes: Uint8Array): Promise<void> {
  const item = artifact(expected, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== item.size) {
    throw new DistributionError('SIZE_MISMATCH', 'Artifact size differs: ' + item.file);
  }
  if (await sha256(bytes) !== item.sha256) {
    throw new DistributionError('HASH_MISMATCH', 'Artifact SHA-256 differs: ' + item.file);
  }
}

export interface VerifiedExtensionDistribution {
  readonly distribution: ExtensionDistribution;
  readonly api: ExtensionManifest;
  /** Host-owned snapshots. Load these verified bytes rather than fetching the artifacts again. */
  readonly bytes: DistributionBytes;
}

function readApiBytes(distribution: ExtensionDistribution, bytes: Uint8Array): ExtensionManifest {
  try {
    return readDistributionApi(distribution, JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)));
  } catch (cause) {
    if (cause instanceof DistributionError) throw cause;
    throw new DistributionError('API_MISMATCH', 'Invalid API manifest JSON', {cause});
  }
}

/** Validate and hash both artifacts, then read only the static JSON API manifest. */
export async function verifyExtensionDistribution(value: unknown, bytes: DistributionBytes): Promise<VerifiedExtensionDistribution> {
  const distribution = parseExtensionDistribution(value);
  // Snapshot before the first await so caller mutations cannot change the JSON after hashing.
  const bundle = new Uint8Array(bytes.bundle);
  const api = new Uint8Array(bytes.api);
  await verifyDistributionArtifact(distribution.bundle, bundle);
  await verifyDistributionArtifact(distribution.api, api);
  return Object.freeze({distribution, api: readApiBytes(distribution, api), bytes: Object.freeze({bundle, api})});
}

/** Generate a descriptor from canonical JSON metadata and the final artifact bytes. */
export async function createExtensionDistribution(
  packageMetadata: unknown, buildSettings: unknown,
  bundle: {readonly file: string; readonly bytes: Uint8Array}, apiBytes: Uint8Array
): Promise<ExtensionDistribution> {
  const settings = parseExtensionBuildSettings(buildSettings);
  if (!packageMetadata || typeof packageMetadata !== 'object' || Array.isArray(packageMetadata)) {
    throw new DistributionError('PACKAGE_MISMATCH', 'Missing package metadata');
  }
  const pkg = packageMetadata as Record<string, unknown>;
  let resources: ResourceDeclaration | undefined;
  try {
    resources = readPackageResourceDeclaration(pkg);
  } catch (cause) {
    throw new DistributionError('INVALID_RESOURCES', 'Invalid package resource declaration', {cause});
  }
  const bundleBytes = new Uint8Array(bundle.bytes);
  const api = new Uint8Array(apiBytes);
  const distribution = parseExtensionDistribution({
    formatVersion: 1, id: settings.id, package: pkg.name, version: pkg.version,
    name: settings.name, description: settings.description, license: settings.license,
    execution: settings.unsandboxed ? 'unsandboxed' : 'sandboxed', resources,
    bundle: {file: bundle.file, size: bundleBytes.byteLength, sha256: await sha256(bundleBytes)},
    api: {file: API_MANIFEST, size: api.byteLength, sha256: await sha256(api)}
  });
  assertDistributionPackage(distribution, pkg);
  readApiBytes(distribution, api);
  return distribution;
}
