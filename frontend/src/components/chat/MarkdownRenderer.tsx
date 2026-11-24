import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  language: string;
  value: string;
}

const CodeBlock: React.FC<CodeBlockProps> = React.memo(({ language, value }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  }, [value]);

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex h-7 items-center justify-between border-b border-border bg-muted/40 px-3">
        <span className="font-mono text-[11px] font-medium lowercase tracking-tight text-muted-foreground">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="overflow-x-auto p-3.5 scrollbar-thin">
        <pre className="m-0 font-mono text-[12.5px] leading-[1.6] text-foreground">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
});
CodeBlock.displayName = "CodeBlock";

const markdownComponents: Components = {
  p({ children }) {
    return (
      <p className="mb-3 last:mb-0 text-[14px] leading-[1.68] text-foreground/95">
        {children}
      </p>
    );
  },
  h1({ children }) {
    return (
      <h1 className="mb-3 mt-5 first:mt-0 text-base font-semibold tracking-tight text-foreground">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-2.5 mt-4 first:mt-0 text-[15px] font-semibold tracking-tight text-foreground">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="mb-2 mt-3.5 first:mt-0 text-sm font-semibold text-foreground">
        {children}
      </h3>
    );
  },
  ul({ children }) {
    return (
      <ul className="mb-3 ml-5 list-disc space-y-1 text-[14px] leading-[1.65] text-foreground/95 marker:text-muted-foreground">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="mb-3 ml-5 list-decimal space-y-1 text-[14px] leading-[1.65] text-foreground/95 marker:font-mono marker:text-xs marker:text-muted-foreground">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="pl-1">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-2 border-border-strong pl-3.5 text-[13.5px] italic text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-4 border-border" />;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground"
      >
        <span>{children}</span>
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" />
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-3.5 w-full overflow-x-auto rounded-md border border-border scrollbar-thin">
        <table className="w-full border-collapse text-left text-xs tabular-nums">
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="border-b border-border bg-muted/50 font-medium text-muted-foreground">
        {children}
      </thead>
    );
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-border">{children}</tbody>;
  },
  tr({ children }) {
    return (
      <tr className="transition-colors hover:bg-surface-hover/50">{children}</tr>
    );
  },
  th({ children }) {
    return (
      <th className="px-3 py-2 font-semibold tracking-tight text-foreground">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="px-3 py-2 align-top text-foreground/90 leading-relaxed">
        {children}
      </td>
    );
  },
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const rawText = String(children).replace(/\n$/, "");
    const isBlock = Boolean(match) || rawText.includes("\n");

    if (isBlock) {
      return <CodeBlock language={match?.[1] || "text"} value={rawText} />;
    }

    return (
      <code
        className={cn(
          "rounded-sm border border-border/80 bg-muted/70 px-1.5 py-0.5 font-mono text-[12.5px] text-foreground",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(
  ({ content, className }) => {
    if (!content) return null;

    return (
      <div className={cn("min-w-0 max-w-none break-words", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }
);
MarkdownRenderer.displayName = "MarkdownRenderer";

