import React from 'react';

/**
 * The small slice of Markdown the legal documents use — `##`/`###` headings,
 * `-` lists, `**bold**` and paragraphs — built as React elements, so text the
 * admin typed is never injected as HTML.
 */
export const LegalMarkdown: React.FC<{ source: string; className?: string }> = ({ source, className = '' }) => {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc pl-6 space-y-1.5 text-slate-300">
        {list.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </ul>
    );
    list = [];
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={blocks.length} className="text-slate-300 leading-relaxed">{inline(paragraph.join(' '))}</p>);
    paragraph = [];
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);

    if (heading) {
      flushList();
      flushParagraph();
      const text = inline(heading[2]);
      blocks.push(heading[1].length <= 2
        ? <h2 key={blocks.length} className="text-lg font-bold text-white font-heading pt-4">{text}</h2>
        : <h3 key={blocks.length} className="text-base font-semibold text-white pt-2">{text}</h3>);
    } else if (item) {
      flushParagraph();
      list.push(item[1]);
    } else if (line.trim() === '') {
      flushList();
      flushParagraph();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushList();
  flushParagraph();

  return <div className={`space-y-3 text-base ${className}`}>{blocks}</div>;
};

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
      : part
  );
}
