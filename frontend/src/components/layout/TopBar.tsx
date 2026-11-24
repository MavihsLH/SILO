import * as React from "react";
import {
  Check,
  Moon,
  PanelLeft,
  Pencil,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatSessionSummary, CollectionSummary } from "@/types/api";

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeCollection: CollectionSummary | null;
  activeChat: ChatSessionSummary | null;
  onRenameChat: (chatId: string, newTitle: string) => Promise<void>;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = React.memo(
  ({
    sidebarOpen,
    onToggleSidebar,
    activeCollection,
    activeChat,
    onRenameChat,
    theme,
    onToggleTheme,
    onOpenSettings,
  }) => {
    const [isEditingTitle, setIsEditingTitle] = React.useState(false);
    const [titleDraft, setTitleDraft] = React.useState("");

    React.useEffect(() => {
      setIsEditingTitle(false);
      setTitleDraft(activeChat?.title || "");
    }, [activeChat?.id, activeChat?.title]);

    const commitTitleRename = async () => {
      if (!activeChat) return;
      const trimmed = titleDraft.trim();
      setIsEditingTitle(false);
      if (trimmed && trimmed !== activeChat.title) {
        await onRenameChat(activeChat.id, trimmed);
      } else {
        setTitleDraft(activeChat.title);
      }
    };

    return (
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-3.5 select-none">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            </TooltipContent>
          </Tooltip>

          {!sidebarOpen && (
            <div className="flex items-center pl-0.5 pr-1">
              <img
                src="/img/logo-dark-crop.png"
                alt="SILO"
                className="h-4 w-auto object-contain dark:block hidden select-none"
              />
              <img
                src="/img/logo-light-crop.png"
                alt="SILO"
                className="h-4 w-auto object-contain dark:hidden block select-none"
              />
            </div>
          )}

          <div className="h-4 w-px bg-border" />

          {/* Breadcrumb Context: Collection / Thread */}
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {activeCollection ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className="h-2 w-2 shrink-0 rounded-xs"
                  style={{ backgroundColor: activeCollection.color }}
                />
                <span className="font-medium text-muted-foreground">
                  {activeCollection.name}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">No Collection</span>
            )}

            {activeChat && (
              <>
                <span className="text-muted-foreground/50">/</span>
                {isEditingTitle ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitTitleRename();
                        if (e.key === "Escape") {
                          setIsEditingTitle(false);
                          setTitleDraft(activeChat.title);
                        }
                      }}
                      autoFocus
                      className="h-6 w-48 rounded-sm border border-border-strong bg-surface px-2 text-xs text-foreground focus:outline-none"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => void commitTitleRename()}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setIsEditingTitle(false);
                        setTitleDraft(activeChat.title);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(activeChat.title);
                      setIsEditingTitle(true);
                    }}
                    className="group inline-flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-surface-hover"
                    title="Click to rename session"
                  >
                    <span className="truncate max-w-[220px] sm:max-w-[360px]">
                      {activeChat.title}
                    </span>
                    <Pencil className="h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleTheme}
                aria-label="Toggle color theme"
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Switch to {theme === "dark" ? "light" : "dark"} theme
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                aria-label="Model and RAG settings"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Configure Ollama models & Self-RAG verification
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
    );
  }
);
TopBar.displayName = "TopBar";

