import * as React from "react";
import { ArrowUp, Paperclip, Square, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ChatComposerProps {
  onSend: (message: string, onlineMode: boolean) => Promise<void> | void;
  onStop: () => void;
  onTriggerUpload: () => void;
  isStreaming: boolean;
  disabled: boolean;
  activeCollectionName: string | null;
  onlineMode: boolean;
  onOnlineModeChange: (enabled: boolean) => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = React.memo(
  ({
    onSend,
    onStop,
    onTriggerUpload,
    isStreaming,
    disabled,
    activeCollectionName,
    onlineMode,
    onOnlineModeChange,
  }) => {
    const [draft, setDraft] = React.useState("");
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const adjustTextareaHeight = React.useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }, []);

    React.useEffect(() => {
      adjustTextareaHeight();
    }, [draft, adjustTextareaHeight]);

    const handleSubmit = React.useCallback(() => {
      const trimmed = draft.trim();
      if (!trimmed || isStreaming || disabled) return;
      setDraft("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      void onSend(trimmed, onlineMode);
    }, [draft, isStreaming, disabled, onSend, onlineMode]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const canSubmit = draft.trim().length > 0 && !disabled && !isStreaming;

    return (
      <div className="shrink-0 border-t border-border bg-background/95 px-4 pb-4 pt-3 backdrop-blur-xs">
        <div className="mx-auto w-full max-w-5xl">
          <div
            className={cn(
              "flex flex-col rounded-lg border border-border bg-surface-elevated transition-colors focus-within:border-border-strong",
              disabled && "opacity-60"
            )}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeCollectionName
                  ? `Query ${activeCollectionName}...`
                  : "Select or create a collection to begin querying..."
              }
              className="max-h-[180px] min-h-[42px] w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed scrollbar-thin"
            />

            <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      onClick={onTriggerUpload}
                      aria-label="Upload document to active collection"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Upload PDF, TXT, MD, or CSV to collection
                  </TooltipContent>
                </Tooltip>

                <div className="h-3.5 w-px bg-border" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <label
                      htmlFor="composer-web-fallback"
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground select-none"
                    >
                      <Globe className="h-3 w-3" />
                      <span>Web Fallback</span>
                      <Switch
                        id="composer-web-fallback"
                        checked={onlineMode}
                        onCheckedChange={onOnlineModeChange}
                        disabled={disabled}
                      />
                    </label>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Search the web if your documents don't have the answer.
                    Your files are never uploaded or shared.
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden font-mono text-[10px] text-muted-foreground/70 sm:inline">
                  Return to send · Shift+Return for newline
                </span>

                {isStreaming ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        onClick={onStop}
                        aria-label="Stop generation"
                        className="h-7 w-7"
                      >
                        <Square className="h-3 w-3 fill-current" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Stop generation</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    aria-label="Send message"
                    className="h-7 w-7"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
ChatComposer.displayName = "ChatComposer";

