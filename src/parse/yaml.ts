// Minimal, robust Unity YAML parser designed for AssetRipper export format.
// Preserves document structure, class IDs, file IDs, scalar values, vectors, refs, and arrays.

import { RawYamlDocument } from '../model/types.js';

export interface ParsedDocument {
  classId: number;
  fileId: number;
  className: string;
  data: Record<string, unknown>;
}

/**
 * Fast multi-document Unity YAML splitter.
 */
export function splitUnityYaml(yamlContent: string): { classId: number; fileId: number; className: string; lines: string[] }[] {
  const lines = yamlContent.split(/\r?\n/);
  const docs: { classId: number; fileId: number; className: string; lines: string[] }[] = [];

  let currentClassId = 0;
  let currentFileId = 0;
  let currentClassName = '';
  let currentLines: string[] = [];
  let inDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('--- !u!')) {
      if (inDoc && currentLines.length > 0) {
        while (currentLines.length > 0 && !currentLines[currentLines.length - 1].trim()) {
          currentLines.pop();
        }
        docs.push({
          classId: currentClassId,
          fileId: currentFileId,
          className: currentClassName,
          lines: currentLines,
        });
      }

      // Fast parse: --- !u!1 &100
      const spaceIdx = line.indexOf(' ', 7);
      if (spaceIdx !== -1) {
        currentClassId = parseInt(line.substring(7, spaceIdx), 10);
        const ampIdx = line.indexOf('&', spaceIdx);
        currentFileId = ampIdx !== -1 ? parseInt(line.substring(ampIdx + 1), 10) : 0;
      } else {
        currentClassId = parseInt(line.substring(7), 10);
        currentFileId = 0;
      }

      currentClassName = '';
      currentLines = [];
      inDoc = true;
      continue;
    }

    if (inDoc) {
      if (!currentClassName) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1 && !line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('-')) {
          currentClassName = line.substring(0, colonIdx).trim();
        }
      }
      currentLines.push(line);
    }
  }

  if (inDoc && currentLines.length > 0) {
    while (currentLines.length > 0 && !currentLines[currentLines.length - 1].trim()) {
      currentLines.pop();
    }
    docs.push({
      classId: currentClassId,
      fileId: currentFileId,
      className: currentClassName,
      lines: currentLines,
    });
  }

  return docs;
}

/**
 * Parse an inline flow mapping like {x: 0, y: 0, z: 0} or {fileID: 123, guid: abc, type: 2}
 */
export function parseInlineFlow(str: string): unknown {
  const trimmed = str.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return {};

    const obj: Record<string, unknown> = {};
    const pairs = splitByTopLevelComma(inner);
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':');
      if (colonIdx !== -1) {
        const key = pair.slice(0, colonIdx).trim();
        const valStr = pair.slice(colonIdx + 1).trim();
        obj[key] = parseValue(valStr);
      }
    }
    return obj;
  } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    const items = splitByTopLevelComma(inner);
    return items.map((item) => parseValue(item.trim()));
  }
  return parseScalar(trimmed);
}

function splitByTopLevelComma(str: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      current += char;
      if (char === stringChar && str[i - 1] !== '\\') {
        inString = false;
      }
    } else if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      current += char;
    } else if (char === '{' || char === '[') {
      depth++;
      current += char;
    } else if (char === '}' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      results.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    results.push(current.trim());
  }
  return results;
}

export function parseScalar(str: string): unknown {
  const s = str.trim();
  if (!s) return '';
  // Fast exit for long hex strings / raw text blocks to avoid regex performance traps
  if (s.length > 64) return s;

  if (s === 'null' || s === '~') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;

  // Handle quoted strings
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }

  // Integer or Float
  if (/^-?\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isSafeInteger(n) ? n : s;
  }
  if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(s) || /^-?\d+([eE][-+]?\d+)+$/.test(s)) {
    const f = parseFloat(s);
    return isNaN(f) ? s : f;
  }

  return s;
}

export function parseValue(valStr: string): unknown {
  const s = valStr.trim();
  if (s.startsWith('{') || s.startsWith('[')) {
    return parseInlineFlow(s);
  }
  return parseScalar(s);
}

/**
 * Parse an array of line strings belonging to a single document.
 */
export function parseYamlDocumentLines(lines: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: { indent: number; node: any; key?: string }[] = [{ indent: -1, node: root }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#') || line.trim().startsWith('%')) continue;

    const indent = line.search(/\S/);
    const content = line.trim();
    const isArrayItem = content.startsWith('- ');

    // Adjust stack based on indentation
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (isArrayItem && Array.isArray(top.node) && top.indent === indent) {
        break;
      }
      if (top.indent >= indent) {
        stack.pop();
      } else {
        break;
      }
    }

    const currentParent = stack[stack.length - 1].node;

    // Check if line is array item: "- ..."
    if (isArrayItem) {
      const itemContent = content.slice(2).trim();
      if (!Array.isArray(currentParent)) {
        continue;
      }
      if (itemContent.startsWith('{') || itemContent.startsWith('[')) {
        currentParent.push(parseInlineFlow(itemContent));
      } else if (itemContent.includes(':')) {
        const colonIdx = itemContent.indexOf(':');
        const key = itemContent.slice(0, colonIdx).trim();
        const val = itemContent.slice(colonIdx + 1).trim();
        const obj: Record<string, unknown> = {};
        if (val) {
          obj[key] = parseValue(val);
        } else {
          obj[key] = {};
        }
        currentParent.push(obj);
        stack.push({ indent, node: obj, key });
      } else {
        currentParent.push(parseScalar(itemContent));
      }
      continue;
    }

    // Key-value pair
    const colonIdx = content.indexOf(':');
    if (colonIdx !== -1) {
      const key = content.slice(0, colonIdx).trim();
      const valStr = content.slice(colonIdx + 1).trim();

      if (valStr.length > 0) {
        currentParent[key] = parseValue(valStr);
      } else {
        let isChildArray = false;
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextIndent = nextLine.search(/\S/);
          if (nextIndent >= indent && nextLine.trim().startsWith('- ')) {
            isChildArray = true;
          }
        }
        const childContainer = isChildArray ? [] : {};
        currentParent[key] = childContainer;
        stack.push({ indent, node: childContainer, key });
      }
    }
  }

  return root;
}

/**
 * Parse an entire multi-doc Unity YAML file into RawYamlDocument array.
 */
export function parseUnityYamlFile(yamlContent: string): RawYamlDocument[] {
  const rawDocs = splitUnityYaml(yamlContent);
  const result: RawYamlDocument[] = [];

  for (const doc of rawDocs) {
    const tree = parseYamlDocumentLines(doc.lines);
    const data = (tree[doc.className] as Record<string, unknown>) || tree;
    result.push({
      classId: doc.classId,
      fileId: doc.fileId,
      className: doc.className,
      data,
    });
  }

  return result;
}
