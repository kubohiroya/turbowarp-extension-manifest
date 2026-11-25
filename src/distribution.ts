// SPDX-License-Identifier: MPL-2.0
import {parseResourceDeclaration, type ResourceDeclaration} from './resources.js';

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

export class DistributionError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
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
  if (!api || typeof api !== 'object' || !('id' in api) || api.id !== distribution.id ||
      !('formatVersion' in api) || (api.formatVersion !== 1 && api.formatVersion !== 2) ||
      !('blocks' in api) || !Array.isArray(api.blocks)) {
    throw new DistributionError('API_MISMATCH', 'The block API manifest does not match the distribution');
  }
}
