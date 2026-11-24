import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { SourceCitation } from "@/types/api";

interface SourceCitationsProps {
  sources: SourceCitation[];
}

/**
 * Expandable citation reference drawer built on Radix Collapsible + GPU-accelerated
 * opacity/transform shifts. Eliminates clipped hover tooltips in favor of structured,
 * scannable evidence inspection.
 */
export const SourceCitations: React.FC<SourceCitationsProps> = React.memo(
  ({ sources }) => {
    const [open, setOpen] = React.useState(false);

    if (!sources || sources.length === 0) {
      return null;
    }

    const localCount = sources.filter((s) => s.type !== "web").length;
    const webCount = sources.filter((s) => s.type === "web").length;

    const summaryParts: string[] = [];
    if (localCount > 0) {
      summaryParts.push(`${localCount} document${localCount > 1 ? "s" : ""}`);
    }
    if (webCount > 0) {
      summaryParts.push(`${webCount} web`);
    }

    return (
      <div className="mt-3 pt-2 border-t border-border/60">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group inline-flex items-center gap-1.5 rounded-sm py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform duration-150 ease-out",
                  open && "rotate-90 text-foreground"
                )}
              />
              <span>
                {sources.length} {sources.length === 1 ? "source" : "sources"} referenced
              </span>
              {summaryParts.length > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground/75">
                  ({summaryParts.join(" · ")})
                </span>
              )}
            </button>
          </CollapsibleTrigger>

          <AnimatePresence initial={false}>
            {open && (
              <CollapsibleContent forceMount asChild>
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.14, ease: "easeOut" }}
                  className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 gpu-layer"
                >
                  {sources.map((source, idx) => {
                    const isWeb = source.type === "web";
                    const label = isWeb
                      ? source.metadata?.title || "Web Result"
                      : source.metadata?.file_name ||
                        source.metadata?.document_title ||
                        `Excerpt ${idx + 1}`;
                    const pageLabel = source.metadata?.page_label;
                    const url =
                      typeof source.metadata?.url === "string"
                        ? source.metadata.url
                        : null;
                    const scorePercent =
                      !isWeb && typeof source.score === "number"
                        ? `${Math.min(100, Math.max(0, source.score * 100)).toFixed(1)}%`
                        : null;

                    return (
                      <div
                        key={`${label}-${idx}`}
                        className="flex flex-col justify-between rounded-md border border-border bg-surface p-2.5 text-xs transition-colors hover:border-border-strong"
                      >
                        <div>
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              {isWeb ? (
                                <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                              ) : (
                                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                              <span
                                className="truncate font-medium text-foreground"
                                title={String(label)}
                              >
                                {String(label)}
                              </span>
                              {pageLabel && (
                                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                  p.{String(pageLabel)}
                                </span>
                              )}
                            </div>

                            {scorePercent ? (
                              <span
                                className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                                title="Cross-encoder relevance score"
                              >
                                {scorePercent}
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                Web
                              </span>
                            )}
                          </div>

                          <p className="line-clamp-3 font-sans text-[11.5px] leading-relaxed text-muted-foreground">
                            {source.text}
                          </p>
                        </div>

                        {url && (
                          <div className="mt-2 border-t border-border/60 pt-1.5">
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <span className="truncate">{url}</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              </CollapsibleContent>
            )}
          </AnimatePresence>
        </Collapsible>
      </div>
    );
  }
);
SourceCitations.displayName = "SourceCitations";

