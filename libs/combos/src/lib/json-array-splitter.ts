const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
const COLON = 0x3a;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;

export type JsonScalar = string | number | boolean | null;

/** What the text being collected is: a top-level key, a top-level scalar value, or an array element. */
type Span = 'none' | 'key' | 'value' | 'element';

/**
 * Splits the elements of one top-level array out of a JSON document that
 * arrives in chunks, without ever holding more than one element.
 *
 * Commander Spellbook's bulk file is `{ "timestamp": ..., "variants": [ 121k
 * objects ] }` and over 700 MB once unzipped, longer than the longest string
 * Node can build, so it cannot go through `JSON.parse` in one piece. This
 * only tracks nesting depth and string state, which is enough to find where
 * each element starts and ends; the caller parses each element's text.
 *
 * Feed it the bytes in order with `push`, then call `end`.
 */
export class JsonArraySplitter {
  /** Top-level properties whose value is a string, number, boolean or null, as far as the document has been read. */
  readonly scalars = new Map<string, JsonScalar>();

  // Streaming, so a character cut in two by a chunk boundary is held back until its last byte arrives.
  private readonly decoder = new TextDecoder('utf-8');
  private depth = 0;
  private inString = false;
  private escaped = false;
  private rootIsObject = false;
  private key: string | undefined;
  private arrayFound = false;
  private inArray = false;
  private span: Span = 'none';
  /** The part of the open span that arrived in earlier chunks. */
  private held = '';

  constructor(private readonly property: string) {}

  /** True once the named property has been seen at the top level with an array as its value. */
  get found(): boolean {
    return this.arrayFound;
  }

  /** Takes the next chunk and returns the JSON text of every element it completed. */
  push(chunk: Uint8Array): string[] {
    const elements: string[] = [];
    this.scan(this.decoder.decode(chunk, { stream: true }), elements);
    return elements;
  }

  /** Call after the last chunk. Throws when the document stopped part-way, so a cut-off download is not mistaken for a short one. */
  end(): void {
    this.scan(this.decoder.decode(), []);
    if (this.depth !== 0 || this.inString) throw new Error('JSON document ended early: it is cut off or not valid JSON');
  }

  private scan(text: string, elements: string[]): void {
    let start = this.span === 'none' ? -1 : 0;
    const take = (end: number): string => {
      const taken = (this.held + text.slice(start, end)).trim();
      this.held = '';
      return taken;
    };

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (code === BACKSLASH) this.escaped = true;
        else if (code === QUOTE) this.inString = false;
        continue;
      }

      switch (code) {
        case QUOTE:
          this.inString = true;
          break;

        case OPEN_BRACE:
        case OPEN_BRACKET:
          this.depth++;
          if (this.depth === 1) {
            this.rootIsObject = code === OPEN_BRACE;
            if (this.rootIsObject) {
              this.span = 'key';
              start = i + 1;
            }
          } else if (this.depth === 2 && this.span === 'value') {
            // The value is an object or array, not a scalar: only the wanted array is read, the rest is skipped unbuffered.
            this.held = '';
            if (code === OPEN_BRACKET && this.key === this.property && !this.arrayFound) {
              this.arrayFound = true;
              this.inArray = true;
              this.span = 'element';
              start = i + 1;
            } else {
              this.span = 'none';
            }
          }
          break;

        case CLOSE_BRACE:
        case CLOSE_BRACKET:
          if (this.depth === 2 && this.inArray) {
            const element = take(i);
            if (element) elements.push(element);
            this.inArray = false;
            this.span = 'none';
          } else if (this.depth === 1) {
            if (this.span === 'value') this.setScalar(take(i));
            this.held = '';
            this.span = 'none';
          }
          this.depth--;
          break;

        case COMMA:
          if (this.depth === 2 && this.inArray) {
            const element = take(i);
            if (element) elements.push(element);
            start = i + 1;
          } else if (this.depth === 1 && this.rootIsObject) {
            if (this.span === 'value') this.setScalar(take(i));
            this.span = 'key';
            start = i + 1;
          }
          break;

        case COLON:
          if (this.depth === 1 && this.span === 'key') {
            this.key = JSON.parse(take(i)) as string;
            this.span = 'value';
            start = i + 1;
          }
          break;
      }
    }

    if (this.span !== 'none') this.held += text.slice(start);
  }

  private setScalar(text: string): void {
    if (text && this.key !== undefined) this.scalars.set(this.key, JSON.parse(text) as JsonScalar);
  }
}
