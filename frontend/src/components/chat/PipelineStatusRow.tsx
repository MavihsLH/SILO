import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { resolvePipelineStatus } from "@/lib/utils";

interface PipelineStatusRowProps {
  statusText: string | null;
  isStreaming: boolean;
}

/**
 * Principle of Transparency:
 * Renders explicit, minimal operational micro-copy when a multi-step LangGraph
 * cycle triggers (e.g. "Retrieving context from vector index...",
 * "Re-ranking & grading source relevance...", "Synthesizing response...").
 *
 * Reserves a strict 24px height container while active to prevent layout shifts.
 */
export const PipelineStatusRow: React.FC<PipelineStatusRowProps> = React.memo(
  ({ statusText, isStreaming }) => {
    const resolved = resolvePipelineStatus(statusText);

    if (!isStreaming || !resolved) {
      return null;
    }

    return (
      <div
        className="mb-2 flex h-6 items-center gap-2 text-xs text-muted-foreground select-none"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground/80" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={resolved.displayLabel}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="font-mono text-[11.5px] tracking-tight text-muted-foreground"
          >
            {resolved.displayLabel}
          </motion.span>
        </AnimatePresence>
      </div>
    );
  }
);
PipelineStatusRow.displayName = "PipelineStatusRow";

