import * as React from "react";
import { Check, Copy, AlertCircle } from "lucide-react";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { PipelineStatusRow } from "@/components/chat/PipelineStatusRow";
import { SourceCitations } from "@/components/chat/SourceCitations";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/api";

interface MessageTurnProps {
  message: ChatMessage;
  pipelineStatus: string | null;
}

/**
 * Memoized single conversation turn.
 * - Eliminates cartoon/emoji avatars ("👤", "🧠") in favor of clean typographic alignment.
 * - Reserves `min-h-[2.25rem]` on streaming assistant turns to guarantee 0.000 CLS.
 */
export const MessageTurn: React.FC<MessageTurnProps> = React.memo(
  ({ message, pipelineStatus }) => {
    const [copied, setCopied] = React.useState(false);
    const isUser = message.role === "user";

    const handleCopyTurn = React.useCallback(async () => {
      if (!message.content) return;
      try {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        // Ignore clipboard errors
      }
    }, [message.content]);

    if (isUser) {
      return (
        <div className="flex w-full justify-end py-3">
          <div className="max-w-[82%] sm:max-w-[75%] rounded-lg border border-border bg-surface-elevated px-4 py-2.5 text-[14px] leading-[1.6] text-foreground">
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="group relative flex w-full flex-col py-4 border-b border-border/40 last:border-b-0">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
            Response
          </span>

          {message.content && !message.isStreaming && (
            <button
              type="button"
              onClick={handleCopyTurn}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground group-hover:opacity-100 focus:opacity-100"
              aria-label="Copy response"
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
          )}
        </div>

        {/* Fixed minimum footprint during streaming to prevent vertical layout shift */}
        <div className={cn("min-w-0", message.isStreaming && "min-h-[2.25rem]")}>
          <PipelineStatusRow
            statusText={pipelineStatus}
            isStreaming={Boolean(message.isStreaming)}
          />

          {message.error && (
            <div className="mb-2 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{message.error}</span>
            </div>
          )}

          {message.content ? (
            <MarkdownRenderer content={message.content} />
          ) : (
            !message.isStreaming &&
            !message.error && (
              <p className="text-xs italic text-muted-foreground">
                No output generated.
              </p>
            )
          )}

          {message.sources && message.sources.length > 0 && (
            <SourceCitations sources={message.sources} />
          )}
        </div>
      </div>
    );
  }
);
MessageTurn.displayName = "MessageTurn";

