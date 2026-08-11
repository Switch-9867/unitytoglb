import { describe, it, expect } from 'vitest';
import { splitUnityYaml, parseScalar, parseInlineFlow, parseUnityYamlFile } from '../../src/parse/yaml.js';

describe('Unity YAML Parser', () => {
  it('splits multi-doc Unity YAML headers correctly', () => {
    const yaml = `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1 &100
GameObject:
  m_Name: Test
--- !u!4 &101
Transform:
  m_LocalPosition: {x: 1, y: 2, z: 3}
`;
    const docs = splitUnityYaml(yaml);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual({
      classId: 1,
      fileId: 100,
      className: 'GameObject',
      lines: ['GameObject:', '  m_Name: Test'],
    });
    expect(docs[1]).toEqual({
      classId: 4,
      fileId: 101,
      className: 'Transform',
      lines: ['Transform:', '  m_LocalPosition: {x: 1, y: 2, z: 3}'],
    });
  });

  it('parses scalars correctly', () => {
    expect(parseScalar('123')).toBe(123);
    expect(parseScalar('-456')).toBe(-456);
    expect(parseScalar('3.14159')).toBeCloseTo(3.14159);
    expect(parseScalar('-1.1808302E-06')).toBeCloseTo(-1.1808302e-6);
    expect(parseScalar('true')).toBe(true);
    expect(parseScalar('false')).toBe(false);
    expect(parseScalar('"hello world"')).toBe('hello world');
    expect(parseScalar("'quoted string'")).toBe('quoted string');
    expect(parseScalar('null')).toBe(null);
    expect(parseScalar('~')).toBe(null);
  });

  it('parses inline flow objects and vectors', () => {
    expect(parseInlineFlow('{x: 1, y: 2.5, z: -3}')).toEqual({ x: 1, y: 2.5, z: -3 });
    expect(parseInlineFlow('{fileID: 4300000, guid: e734c010, type: 2}')).toEqual({
      fileID: 4300000,
      guid: 'e734c010',
      type: 2,
    });
    expect(parseInlineFlow('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('parses complete Unity YAML documents', () => {
    const yaml = `--- !u!1 &100
GameObject:
  m_Name: Cube
  m_Layer: 5
  m_IsActive: 1
--- !u!4 &101
Transform:
  m_LocalPosition: {x: 10, y: 20, z: 30}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
    const parsed = parseUnityYamlFile(yaml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].classId).toBe(1);
    expect(parsed[0].fileId).toBe(100);
    expect(parsed[0].data['m_Name']).toBe('Cube');
    expect(parsed[0].data['m_Layer']).toBe(5);

    expect(parsed[1].classId).toBe(4);
    expect(parsed[1].fileId).toBe(101);
    expect(parsed[1].data['m_LocalPosition']).toEqual({ x: 10, y: 20, z: 30 });
  });
});
