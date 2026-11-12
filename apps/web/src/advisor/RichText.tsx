import React from 'react';

type Block =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; ordered: boolean; items: { text: string; nested: boolean }[] };

const BULLET = /^(\s*)(?:[-*•]|(\d+)[.)])\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const INLINE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\s][^*\n]*?\*|`[^`\n]+?`)/g;

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const last = out.at(-1);
    if (!line.trim() || RULE.test(line)) {
      // A blank line ends the paragraph or list before it.
      if (last?.kind !== 'heading') out.push({ kind: 'paragraph', lines: [] });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      out.push({ kind: 'heading', text: heading[1]! });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      const item = { text: bullet[3]!, nested: bullet[1]!.length >= 2 };
      const ordered = bullet[2] !== undefined;
      if (last?.kind === 'list' && (last.ordered === ordered || item.nested)) last.items.push(item);
      else out.push({ kind: 'list', ordered, items: [item] });
      continue;
    }
    if (last?.kind === 'paragraph') last.lines.push(line.trim());
    else out.push({ kind: 'paragraph', lines: [line.trim()] });
  }
  return out.filter(block => block.kind !== 'paragraph' || block.lines.length > 0);
}

function inline(text: string): React.ReactNode[] {
  // Models reach for LaTeX arrows now and then; a plain arrow says the same.
  const plain = text.replace(/\$\\(?:right)?arrow\$|\$\\to\$/g, '→');
  return plain.split(INLINE).map((part, i) => {
    if (/^(\*\*|__)/.test(part) && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/**
 * The small part of Markdown a model's answer uses: bold, italics, code, lists
 * and headings. Everything is rendered as text nodes, never as HTML, and links
 * stay plain text: the words come from a model.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {blocks(text).map((block, i) => {
        if (block.kind === 'heading') return <p key={i} className="rich-heading">{inline(block.text)}</p>;
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={i}>
              {block.items.map((item, j) => (
                <li key={j} className={item.nested ? 'rich-nested' : undefined}>{inline(item.text)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {inline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
