import { describe, it, expect } from 'vitest';
import { JsonArraySplitter } from './json-array-splitter';

const encoder = new TextEncoder();

/** Feeds the document in pieces of `size` bytes and returns every element text that came out. */
function split(json: string, size: number, property = 'variants'): { elements: string[]; splitter: JsonArraySplitter } {
  const bytes = encoder.encode(json);
  const splitter = new JsonArraySplitter(property);
  const elements: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += size) {
    elements.push(...splitter.push(bytes.subarray(offset, offset + size)));
  }
  splitter.end();
  return { elements, splitter };
}

describe('JsonArraySplitter', () => {
  const variants = [
    { id: '1-2', uses: [{ card: { name: 'Sol Ring' }, quantity: 1 }], notes: '' },
    { id: '3-4--5', uses: [], description: 'Braces } ] { [ and a comma, inside a string' },
    { id: '6', nested: { deep: [[1, 2], { variants: ['not this one'] }] } },
  ];
  const document = JSON.stringify({ timestamp: '2026-11-12T03:00:00Z', version: '5.4.1', variants, aliases: [{ id: 'old' }] });

  it('hands back each element of the named array as its own JSON text', () => {
    const { elements } = split(document, 1 << 16);
    expect(elements.map(text => JSON.parse(text))).toEqual(variants);
  });

  it('gives the same elements whatever the chunk size', () => {
    for (const size of [1, 2, 3, 7, 64]) {
      const { elements } = split(document, size);
      expect(elements.map(text => JSON.parse(text))).toEqual(variants);
    }
  });

  it('keeps a multi-byte character whole when a chunk boundary falls inside it', () => {
    const tricky = [{ name: 'Lim-Dûl’s Vault', text: 'Séance — 日本語 🃏' }];
    const json = JSON.stringify({ variants: tricky });
    const bytes = encoder.encode(json);
    // Every possible cut, so each byte of each multi-byte sequence starts a chunk once.
    for (let cut = 1; cut < bytes.length; cut++) {
      const splitter = new JsonArraySplitter('variants');
      const elements = [...splitter.push(bytes.subarray(0, cut)), ...splitter.push(bytes.subarray(cut))];
      splitter.end();
      expect(elements.map(text => JSON.parse(text))).toEqual(tricky);
    }
  });

  it('does not end a string at an escaped quote that straddles a chunk boundary', () => {
    // A lone escaped quote with brackets after it, which would close the element early if it ended the string;
    // then a string ending in an escaped backslash, whose closing quote is a real one.
    const tricky = [{ text: 'a 6" nail } ], "variants": [ {' }, { text: 'ends with a backslash \\' }, { next: true }];
    const json = JSON.stringify({ variants: tricky });
    expect(json).toContain('6\\" nail }');
    expect(json).toContain('backslash \\\\"}');
    const bytes = encoder.encode(json);
    for (let cut = 1; cut < bytes.length; cut++) {
      const splitter = new JsonArraySplitter('variants');
      const elements = [...splitter.push(bytes.subarray(0, cut)), ...splitter.push(bytes.subarray(cut))];
      splitter.end();
      expect(elements.map(text => JSON.parse(text))).toEqual(tricky);
    }
  });

  it('reports the top-level scalar properties, wherever they sit', () => {
    const json = '{ "timestamp": "2026-11-12T03:00:00Z", "variants": [ {"id":"1"} ], "version": "5.4.1", "count": 1, "beta": false, "note": null }';
    const { splitter } = split(json, 5);
    expect(splitter.scalars).toEqual(
      new Map<string, unknown>([
        ['timestamp', '2026-11-12T03:00:00Z'],
        ['version', '5.4.1'],
        ['count', 1],
        ['beta', false],
        ['note', null],
      ]),
    );
  });

  it('only matches the property at the top level', () => {
    const json = JSON.stringify({ wrapper: { variants: [{ id: 'nested' }] }, variants: [{ id: 'top' }] });
    const { elements } = split(json, 4);
    expect(elements.map(text => JSON.parse(text))).toEqual([{ id: 'top' }]);
  });

  it('splits scalar elements and tolerates whitespace', () => {
    const { elements } = split('{\n  "variants" : [ 1 , "two, three" ,\n null , [4] ]\n}\n', 3);
    expect(elements).toEqual(['1', '"two, three"', 'null', '[4]']);
  });

  it('yields nothing for an empty array, and says whether the array was there at all', () => {
    const empty = split('{"variants": [ ]}', 2);
    expect(empty.elements).toEqual([]);
    expect(empty.splitter.found).toBe(true);

    const absent = split('{"results": [1, 2]}', 2);
    expect(absent.elements).toEqual([]);
    expect(absent.splitter.found).toBe(false);

    const notAnArray = split('{"variants": {"id": 1}}', 2);
    expect(notAnArray.elements).toEqual([]);
    expect(notAnArray.splitter.found).toBe(false);
  });

  it('refuses a document that stops part-way', () => {
    const splitter = new JsonArraySplitter('variants');
    expect(splitter.push(encoder.encode('{"variants":[{"id":"1"},{"id":"2"'))).toEqual(['{"id":"1"}']);
    expect(() => splitter.end()).toThrow(/ended early/);
  });
});
