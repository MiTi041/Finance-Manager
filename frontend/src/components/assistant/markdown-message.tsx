import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Props bewusst explizit statt {...props}: react-markdown reicht intern ein
// `node`-Objekt durch, das sonst in React 19 als DOM-Attribut landen würde.
// Raw HTML bleibt deaktiviert (react-markdown-Default), also XSS-sicher.
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mb-1 mt-3 text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 mt-3 text-sm font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="marker:text-muted-foreground">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a className="underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  code: ({ children }) => (
    <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-background/70 p-3 text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => <table className="my-2 w-full border-collapse text-left">{children}</table>,
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1 font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-border/50 px-2 py-1">{children}</td>,
};

export function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
