import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUpRight, FolderPlus, Upload } from "lucide-react";
import { MessageTurn } from "@/components/chat/MessageTurn";
import { Button } from "@/components/ui/button";
import type { ChatMessage, CollectionSummary } from "@/types/api";

/**
 * Threshold above which DOM virtualization activates to bound DOM node count.
 * Can also virtualize unconditionally; keeping a threshold of 80 (or virtualizing
 * dynamically) guarantees zero overhead on short threads and strict O(1) visible
 * DOM nodes on 100+ message logs.
 */
const VIRTUALIZATION_THRESHOLD = 80;

const DEFAULT_SUGGESTED_PROMPTS = [
  "Summarize the primary findings and core arguments across this collection",
  "Extract key technical specifications, metrics, or tables into a comparison",
  "Identify unresolved questions, risks, or limitations mentioned in the sources",
];

interface ChatCanvasProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  pipelineStatus: string | null;
  activeCollection: CollectionSummary | null;
  onSelectPrompt: (prompt: string) => void;
  onOpenCreateCollection: () => void;
  onTriggerUpload: () => void;
}

export const ChatCanvas: React.FC<ChatCanvasProps> = ({
  messages,
  isStreaming,
  pipelineStatus,
  activeCollection,
  onSelectPrompt,
  onOpenCreateCollection,
  onTriggerUpload,
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const isLockedToBottomRef = React.useRef<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = React.useState(false);

  const shouldVirtualize = messages.length >= VIRTUALIZATION_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 148,
    overscan: 6,
    enabled: shouldVirtualize,
  });

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      if (shouldVirtualize && messages.length > 0) {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      } else {
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      }
      isLockedToBottomRef.current = true;
      setShowScrollBottomBtn(false);
    },
    [messages.length, shouldVirtualize, virtualizer]
  );

  const handleScroll = React.useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < 72;

    isLockedToBottomRef.current = isNearBottom;
    setShowScrollBottomBtn(!isNearBottom && messages.length > 0);
  }, [messages.length]);

  // Keep viewport anchored to bottom during token streaming only if user hasn't scrolled up
  const lastMessageContent = messages[messages.length - 1]?.content;
  React.useEffect(() => {
    if (isLockedToBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [messages.length, lastMessageContent, pipelineStatus, scrollToBottom]);

  // Empty state when no messages exist in the current session
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-2xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <img
              src="/img/logo-dark-crop.png"
              alt="SILO"
              className="h-14 w-auto object-contain dark:block hidden mb-1.5 select-none"
            />
            <img
              src="/img/logo-light-crop.png"
              alt="SILO"
              className="h-14 w-auto object-contain dark:hidden block mb-1.5 select-none"
            />
            <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground/75">
              100% Private · Local Agentic RAG
            </span>
          </div>

          {!activeCollection ? (
            <div className="rounded-lg border border-border bg-surface p-6">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                No Knowledge Collection Selected
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Create an isolated vector collection to partition your PDFs,
                Markdown notes, and CSV datasets. Queries execute strictly
                against the active collection.
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={onOpenCreateCollection}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  <span>Create Collection</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-xs"
                    style={{ backgroundColor: activeCollection.color }}
                  />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {activeCollection.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground/60">
                    · {activeCollection.file_count}{" "}
                    {activeCollection.file_count === 1 ? "file" : "files"}
                  </span>
                </div>
                <h2 className="mt-1.5 text-base font-semibold tracking-tight text-foreground">
                  Query local knowledge base
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {activeCollection.description ||
                    "Ask analytical questions across indexed documents. Responses cite exact passages with cross-encoder relevance scores."}
                </p>
              </div>

              {activeCollection.file_count === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-surface/50 p-4">
                  <p className="text-xs text-muted-foreground">
                    This collection has no uploaded documents yet. Upload PDF,
                    TXT, MD, or CSV files and run indexing to enable vector
                    retrieval.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onTriggerUpload}
                    className="mt-3"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Documents</span>
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    Suggested Queries
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {DEFAULT_SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => onSelectPrompt(prompt)}
                        className="group flex items-center justify-between rounded-md border border-border bg-surface px-3.5 py-2.5 text-left text-xs text-foreground/90 transition-colors hover:border-border-strong hover:bg-surface-hover"
                      >
                        <span className="pr-4 leading-snug">{prompt}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full w-full overflow-y-auto px-4 sm:px-6 scrollbar-thin"
      >
        <div className="mx-auto w-full max-w-5xl py-4">
          {shouldVirtualize ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const msg = messages[virtualRow.index];
                if (!msg) return null;
                const isLastAssistant =
                  virtualRow.index === messages.length - 1 &&
                  msg.role === "assistant";

                return (
                  <div
                    key={msg.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="gpu-layer"
                  >
                    <MessageTurn
                      message={msg}
                      pipelineStatus={
                        isLastAssistant && isStreaming ? pipelineStatus : null
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col">
              {messages.map((msg, index) => {
                const isLastAssistant =
                  index === messages.length - 1 && msg.role === "assistant";

                return (
                  <MessageTurn
                    key={msg.id}
                    message={msg}
                    pipelineStatus={
                      isLastAssistant && isStreaming ? pipelineStatus : null
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showScrollBottomBtn && (
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-elevated px-3 py-1 text-xs font-medium text-foreground shadow-md transition-colors hover:bg-surface-hover"
          >
            <ArrowDown className="h-3 w-3" />
            <span>Scroll to latest</span>
          </button>
        </div>
      )}
    </div>
  );
};
ChatCanvas.displayName = "ChatCanvas";

