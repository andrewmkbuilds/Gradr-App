import { Fragment, type ReactNode } from "react";

/**
 * Minimal, dependency-free renderer for the markdown subset used by the legal
 * documents: `## heading`, `- bullet`, paragraphs, `**bold**` and `[a](href)`.
 */

export interface LegalHeading {
  id: string;
  text: string;
}

export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function extractHeadings(markdown: string): LegalHeading[] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => {
      const text = line.slice(3).trim();
      return { id: headingId(text), text };
    });
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1]) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>);
    } else if (match[2] && match[3]) {
      nodes.push(
        <a key={`${keyPrefix}-l${i}`} href={match[3]} className="text-primary underline">
          {match[2]}
        </a>,
      );
    }
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderLegalMarkdown(markdown: string): ReactNode {
  const blocks: ReactNode[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let bullets: string[] = [];
  let paragraph: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i}>{inline(b, `ul${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ");
    blocks.push(<p key={`p-${key++}`}>{inline(text, `p${key}`)}</p>);
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flushBullets();
      flushParagraph();
      const text = line.slice(3).trim();
      blocks.push(
        <h2 key={`h-${key++}`} id={headingId(text)} className="scroll-mt-24 pt-2">
          {text}
        </h2>,
      );
    } else if (line.startsWith("- ")) {
      flushParagraph();
      bullets.push(line.slice(2).trim());
    } else if (line === "") {
      flushBullets();
      flushParagraph();
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushBullets();
  flushParagraph();

  return <Fragment>{blocks}</Fragment>;
}
