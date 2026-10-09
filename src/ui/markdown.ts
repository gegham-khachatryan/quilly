/**
 * Dependency-free Markdown -> HTML for assistant replies.
 * Input is HTML-escaped first, so model output can never inject markup.
 *
 * Supported: headings, paragraphs, fenced code, blockquotes, horizontal rules,
 * GFM tables, nested bullet / numbered lists, task items (- [ ] / - [x]),
 * and inline code / bold / italic / strikethrough / links.
 */
export function renderMarkdown(src: string): string {
  const escaped = src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return renderBlocks(escaped.split('\n'));
}

const LIST_ITEM = /^(\s*)(?:([-*+•])|(\d+)[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join('\n'))}</p>`);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (/^\s*```/.test(line)) {
      flushPara();
      const code: string[] = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i]!)) code.push(lines[i]!);
      out.push(`<pre><code>${code.join('\n')}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushPara();
      out.push(`<h${heading[1]!.length}>${inline(heading[2]!)}</h${heading[1]!.length}>`);
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      out.push('<hr>');
      continue;
    }

    if (/^\s*&gt;/.test(line)) {
      flushPara();
      const quote: string[] = [];
      for (; i < lines.length && /^\s*&gt;/.test(lines[i]!); i++) quote.push(lines[i]!.replace(/^\s*&gt;\s?/, ''));
      i--;
      out.push(`<blockquote>${renderBlocks(quote)}</blockquote>`);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]!)) {
      flushPara();
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]!).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'));
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i]!.includes('|'); i++) rows.push(splitRow(lines[i]!));
      i--;
      const cell = (tag: 'th' | 'td', cells: string[]) =>
        cells.map((c, j) => `<${tag} style="text-align:${aligns[j] ?? 'left'}">${inline(c)}</${tag}>`).join('');
      out.push(
        `<table><thead><tr>${cell('th', header)}</tr></thead><tbody>${rows.map((r) => `<tr>${cell('td', r)}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }

    if (LIST_ITEM.test(line)) {
      flushPara();
      const block: string[] = [];
      // A list continues through indented continuation lines and single blank lines followed by another item.
      for (; i < lines.length; i++) {
        const l = lines[i]!;
        if (LIST_ITEM.test(l) || /^\s+\S/.test(l)) block.push(l);
        else if (!l.trim() && i + 1 < lines.length && LIST_ITEM.test(lines[i + 1]!)) continue;
        else break;
      }
      i--;
      out.push(renderList(block));
      continue;
    }

    if (!line.trim()) {
      flushPara();
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return out.join('');
}

interface Item {
  ordered: boolean;
  text: string;
  children: string[];
}

function renderList(lines: string[]): string {
  const base = lines[0]!.match(LIST_ITEM)![1]!.length;
  const items: Item[] = [];
  for (const line of lines) {
    const m = line.match(LIST_ITEM);
    if (m && m[1]!.length <= base) {
      items.push({ ordered: m[3] !== undefined, text: m[4]!, children: [] });
    } else if (items.length) {
      items.at(-1)!.children.push(line);
    }
  }
  // Consecutive items of the same kind form one list; switching between bullets and numbers starts a new one.
  let html = '';
  let open: 'ul' | 'ol' | null = null;
  for (const item of items) {
    const tag = item.ordered ? 'ol' : 'ul';
    if (open !== tag) {
      if (open) html += `</${open}>`;
      html += `<${tag}>`;
      open = tag;
    }
    html += renderItem(item);
  }
  return open ? `${html}</${open}>` : '';
}

function renderItem(item: Item): string {
  const task = item.text.match(TASK);
  const label = task ? task[2]! : item.text;
  const nested = item.children.length ? renderNested(item.children) : '';
  if (!task) return `<li>${inline(label)}${nested}</li>`;
  const checked = task[1] !== ' ';
  return `<li class="task${checked ? ' done' : ''}"><input type="checkbox" disabled${checked ? ' checked' : ''}><div>${inline(label)}${nested}</div></li>`;
}

/** Children of a list item: nested lists keep their own indentation; other lines are continuation text. */
function renderNested(lines: string[]): string {
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length));
  const dedented = lines.map((l) => l.slice(Math.min(indent, l.match(/^\s*/)![0].length)));
  if (dedented.some((l) => LIST_ITEM.test(l))) return renderBlocks(dedented);
  return ` ${inline(dedented.map((l) => l.trim()).join(' '))}`;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/ {2,}\n|\n/g, '<br>');
}
