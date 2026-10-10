import type { ReactNode } from 'react';

/**
 * A small Markdown renderer for the admin Help page (spec 19.1: the help is generated from
 * docs/ADMIN_GUIDE.md, so the two can never drift apart). It supports what that guide uses:
 * headings, paragraphs, nested lists, tables, block quotes, rules, **bold**, `code` and links.
 * Everything is rendered through React, so text is escaped.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const token = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) out.push(<code key={key} className="bg-hairline px-1 text-[0.9em]">{token.slice(1, -1)}</code>);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token) ?? [];
      // external links open in a new tab; links to other documents stay plain text
      if (href && /^https?:\/\//.test(href)) {
        out.push(
          <a key={key} className="link" href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>,
        );
      } else out.push(label ?? token);
    }
    last = idx + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface ListItem {
  text: string;
  children: ListItem[];
  ordered: boolean;
}

function renderList(items: ListItem[], key: string): ReactNode {
  const ordered = items[0]?.ordered;
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag key={key} className={`${ordered ? 'list-decimal' : 'list-disc'} mt-2 space-y-1 pl-6`}>
      {items.map((item, i) => (
        <li key={i}>
          {inline(item.text, `${key}-${i}`)}
          {item.children.length ? renderList(item.children, `${key}-${i}-c`) : null}
        </li>
      ))}
    </Tag>
  );
}

export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const key = () => `b${n++}`;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key()} className="my-8 border-hairline" />);
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2]!;
      const k = key();
      if (level === 1) out.push(<h1 key={k} className="mb-4 text-3xl">{inline(text, k)}</h1>);
      else if (level === 2) out.push(<h2 key={k} className="mb-2 mt-12 text-2xl">{inline(text, k)}</h2>);
      else out.push(<h3 key={k} className="mb-1 mt-6 text-xl">{inline(text, k)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) parts.push(lines[i++]!.replace(/^>\s?/, ''));
      const k = key();
      out.push(
        <blockquote key={k} className="my-4 border-l-4 border-hairline pl-4 text-stone">
          {inline(parts.join(' '), k)}
        </blockquote>,
      );
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      const k = key();
      out.push(
        <div key={k} className="my-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-[0.95rem]">
            <thead className="border-b border-ink">
              <tr>
                {head?.map((c, ci) => (
                  <th key={ci} scope="col" className="py-2 pr-4 font-medium">
                    {inline(c, `${k}h${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-hairline align-top">
                  {r.map((c, ci) => (
                    <td key={ci} className="py-2 pr-4">
                      {inline(c, `${k}r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const listStart = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (listStart) {
      const root: ListItem[] = [];
      const stack: Array<{ indent: number; items: ListItem[] }> = [{ indent: -1, items: root }];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        const indent = m[1]!.length;
        const item: ListItem = { text: m[3]!, children: [], ordered: /\d/.test(m[2]!) };
        // go back up to the nearest list that is less indented, then add the item there
        while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) stack.pop();
        stack[stack.length - 1]!.items.push(item);
        stack.push({ indent, items: item.children });
        i++;
      }
      out.push(renderList(root, key()));
      continue;
    }
    // paragraph
    const parts: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,3}\s|>|\||---+$|\s*([-*]|\d+\.)\s)/.test(lines[i]!)) parts.push(lines[i++]!.trim());
    const k = key();
    out.push(
      <p key={k} className="mt-3">
        {inline(parts.join(' '), k)}
      </p>,
    );
  }
  return out;
}
