import {describe, expect, it} from 'vitest';
import {parseResourceDeclaration, readPackageResourceDeclaration, resourceText} from '../src/resources.js';

const camera = {type: 'camera', usage: 'required', purpose: {en: 'Read frames', ja: '映像を読む'}};
const declaration = (resources: unknown[]) => ({schemaVersion: 1, resources});
describe('package resource declarations', () => {
  it('distinguishes absent metadata from an explicit empty declaration', () => {
    expect(readPackageResourceDeclaration({name: 'old'})).toBeUndefined();
    expect(readPackageResourceDeclaration({turbowarpExtension: {resourceDeclaration: declaration([])}}))
      .toEqual(declaration([]));
    expect(() => parseResourceDeclaration(null)).toThrow();
  });
  it('copies and freezes localized conditional declarations and network data', () => {
    const input = declaration([{...camera, usage: 'conditional', condition: {en: 'When scanning'},
      via: ['@kubohiroya/turbowarp-camera-source']},
    {type: 'network', usage: 'required', purpose: {en: 'Download models'},
      data: {direction: 'download', content: {en: 'Model weights'}}}]);
    const output = parseResourceDeclaration(input)!;
    expect(output).toEqual(input);
    expect(Object.isFrozen(output.resources[0]?.purpose)).toBe(true);
    expect(output.resources[0]).not.toBe(input.resources[0]);
    expect(resourceText(output.resources[0]!.purpose, 'ja-JP')).toBe('映像を読む');
  });
  it('represents a permission request without implying audio processing', () => {
    expect(parseResourceDeclaration(declaration([{...camera, type: 'microphone', access: 'permission-request'}]))
      ?.resources[0]?.access).toBe('permission-request');
  });
  it.each([
    {schemaVersion: 2, resources: []}, declaration([camera, camera]), declaration([{...camera, type: 'unknown'}]),
    declaration([{...camera, usage: 'conditional'}]), declaration([{...camera, purpose: {ja: '用途'}}]),
    declaration([{...camera, purpose: {en: ' '.repeat(10)}}]),
    declaration([{...camera, purpose: {en: 'x'.repeat(501)}}]), declaration([{...camera, extra: true}]),
    declaration([{...camera, via: ['https://example.com']}]), declaration([{...camera, via: ['a', 'a']}]),
    declaration([{...camera, type: 'network'}]),
    declaration([{...camera, data: {direction: 'upload', content: {en: 'frames'}}}]),
    declaration([{...camera, access: 'granted'}])
  ])('rejects malformed or misleading declarations', input => {
    expect(() => parseResourceDeclaration(input)).toThrow(TypeError);
  });
});

import {Ajv2020} from 'ajv/dist/2020.js';
import schema from '../schemas/resource-declaration.schema.json' with {type: 'json'};

it('keeps the published JSON Schema and runtime validator in agreement', () => {
  const validate = new Ajv2020({allErrors: true}).compile(schema);
  const cases: unknown[] = [
    declaration([]), declaration([camera]),
    declaration([{...camera, purpose: {en: '😀'.repeat(500)}}]),
    declaration([{...camera, purpose: {en: '😀'.repeat(501)}}]),
    declaration([{...camera, usage: 'conditional', condition: {en: 'When reading'}}]),
    declaration([{...camera, usage: 'conditional'}]), declaration([camera, camera]),
    declaration([{...camera, type: 'network', data: {direction: 'download', content: {en: 'Model'}}}]),
    declaration([{...camera, type: 'network'}]), declaration([{...camera, type: 'unknown'}]),
    declaration([{...camera, access: 'permission-request'}]), declaration([{...camera, via: ['@owner/camera']}]),
    declaration([{...camera, purpose: {en: '   '}}]), declaration([{...camera, via: ['bad/url']}]),
    {schemaVersion: 2, resources: []}, null
  ];
  for (const value of cases) {
    let runtime = true;
    try { parseResourceDeclaration(value); } catch { runtime = false; }
    expect(validate(value), JSON.stringify(value)).toBe(runtime);
  }
});
