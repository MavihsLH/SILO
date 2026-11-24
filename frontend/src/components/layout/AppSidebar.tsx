import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  FolderPlus,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import type {
  ChatSessionSummary,
  CollectionFile,
  CollectionSummary,
  IngestionStatusResponse,
} from "@/types/api";

interface AppSidebarProps {
  open: boolean;
  activeTab: "collections" | "chats";
  onTabChange: (tab: "collections" | "chats") => void;
  collections: CollectionSummary[];
  activeCollection: string | null;
  onSelectCollection: (safeName: string) => void;
  onOpenCreateCollection: () => void;
  onOpenEditCollection: (collection: CollectionSummary) => void;
  collectionFiles: CollectionFile[];
  onTriggerUpload: () => void;
  onOpenIndexDialog: () => void;
  ingestionStatus: IngestionStatusResponse | null;
  isIndexing: boolean;
  justCompleted?: boolean;
  onDismissCompleted?: () => void;
  chats: ChatSessionSummary[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCreateNewChat: () => void;
  onRenameChat: (chatId: string, newTitle: string) => Promise<void>;
  onDeleteChat: (chatId: string) => Promise<void>;
}

export const AppSidebar: React.FC<AppSidebarProps> = React.memo(
  ({
    open,
    activeTab,
    onTabChange,
    collections,
    activeCollection,
    onSelectCollection,
    onOpenCreateCollection,
    onOpenEditCollection,
    collectionFiles,
    onTriggerUpload,
    onOpenIndexDialog,
    ingestionStatus,
    isIndexing,
    justCompleted,
    onDismissCompleted,
    chats,
    activeChatId,
    onSelectChat,
    onCreateNewChat,
    onRenameChat,
    onDeleteChat,
  }) => {
    const [editingChatId, setEditingChatId] = React.useState<string | null>(
      null
    );
    const [chatTitleDraft, setChatTitleDraft] = React.useState("");

    const selectedColObj = React.useMemo(
      () => collections.find((c) => c.safe_name === activeCollection) || null,
      [collections, activeCollection]
    );

    const handleCommitChatRename = async (chatId: string) => {
      const trimmed = chatTitleDraft.trim();
      setEditingChatId(null);
      if (trimmed) {
        await onRenameChat(chatId, trimmed);
      }
    };

    return (
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 ease-out select-none overflow-hidden",
          open ? "w-[280px]" : "w-0 border-r-0"
        )}
      >
        {/* Brand & Segmented View Switcher */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3.5">
          <div className="flex items-center gap-2">
            <img
              src="/img/logo-dark-crop.png"
              alt="SILO"
              className="h-5 w-auto object-contain dark:block hidden select-none"
            />
            <img
              src="/img/logo-light-crop.png"
              alt="SILO"
              className="h-5 w-auto object-contain dark:hidden block select-none"
            />
            <span className="rounded-xs border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wider text-muted-foreground uppercase">
              LOCAL RAG
            </span>
          </div>
        </div>

        <div className="p-2.5 pb-1.5">
          <div className="grid grid-cols-2 rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => onTabChange("collections")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-sm py-1 text-xs font-medium transition-colors",
                activeTab === "collections"
                  ? "bg-surface-elevated text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Database className="h-3 w-3" />
              <span>Collections</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange("chats")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-sm py-1 text-xs font-medium transition-colors",
                activeTab === "chats"
                  ? "bg-surface-elevated text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="h-3 w-3" />
              <span>Threads</span>
            </button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════ */}
        {/* COLLECTIONS VIEW                                            */}
        {/* ════════════════════════════════════════════════════════════ */}
        {activeTab === "collections" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-3.5 py-2">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Knowledge Silos ({collections.length})
              </span>
              <button
                type="button"
                onClick={onOpenCreateCollection}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <FolderPlus className="h-3 w-3" />
                <span>New</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2.5 space-y-0.5 scrollbar-thin">
              {collections.length === 0 ? (
                <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                  No collections created yet.
                </div>
              ) : (
                collections.map((col) => {
                  const isActive = col.safe_name === activeCollection;
                  return (
                    <div
                      key={col.safe_name}
                      onClick={() => onSelectCollection(col.safe_name)}
                      className={cn(
                        "group flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs transition-colors",
                        isActive
                          ? "bg-surface-hover text-foreground font-medium"
                          : "text-muted-foreground hover:bg-surface-hover/60 hover:text-foreground"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-xs"
                          style={{ backgroundColor: col.color }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs text-foreground">
                            {col.name}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground tabular-nums">
                            {col.file_count}{" "}
                            {col.file_count === 1 ? "file" : "files"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={col.indexed ? "indexed" : "pending"}>
                          {col.indexed ? "Indexed" : "Pending"}
                        </Badge>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                              aria-label="Manage collection"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCollection(col.safe_name);
                                onOpenEditCollection(col);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Configure Collection</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Active Collection Document & Indexing Inspector */}
            {selectedColObj && (
              <div className="flex max-h-[48%] shrink-0 flex-col border-t border-border bg-background/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Documents
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {collectionFiles.length} total
                  </span>
                </div>

                {/* Real-time Ingestion Progress / Completion / Error Track */}
                {(isIndexing || justCompleted || ingestionStatus?.status === "error") && (
                  <div
                    className={cn(
                      "mb-2.5 rounded-md border p-2.5 transition-colors",
                      ingestionStatus?.status === "error"
                        ? "border-danger/30 bg-danger/5"
                        : justCompleted
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-border bg-surface"
                    )}
                  >
                    {ingestionStatus?.status === "error" ? (
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
                          <span className="text-[11px] font-medium text-danger truncate">
                            Indexing failed
                          </span>
                        </div>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-danger hover:bg-danger/20 transition-colors focus:outline-none"
                            >
                              View Error
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="end"
                            className="max-w-xs p-2.5 bg-surface-elevated border border-border text-foreground shadow-xl"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
                                <span className="font-mono text-[9.5px] font-semibold text-danger uppercase tracking-wider">
                                  Indexing Error Details
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (ingestionStatus?.message) {
                                      void navigator.clipboard.writeText(
                                        ingestionStatus.message
                                      );
                                    }
                                  }}
                                  className="font-mono text-[9px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                                >
                                  Copy
                                </button>
                              </div>
                              <div className="max-h-36 overflow-y-auto font-mono text-[10px] leading-relaxed text-muted-foreground break-words whitespace-pre-wrap scrollbar-thin">
                                {ingestionStatus?.message || "Unknown error during document indexing."}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ) : justCompleted ? (
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Indexing complete!
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              100%
                            </span>
                            {onDismissCompleted && (
                              <button
                                type="button"
                                onClick={onDismissCompleted}
                                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                aria-label="Dismiss completion message"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 font-mono text-[9.5px] text-muted-foreground truncate">
                          {ingestionStatus?.message || "All passages embedded & indexed."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
                          <span className="truncate text-muted-foreground font-medium pr-2">
                            {ingestionStatus?.message || "Processing documents..."}
                          </span>
                          <span className="tabular-nums text-foreground font-semibold shrink-0">
                            {ingestionStatus?.progress ?? 0}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-foreground transition-all duration-300 ease-out"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, ingestionStatus?.progress ?? 0)
                              )}%`,
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
                  {collectionFiles.length === 0 ? (
                    <div className="py-3 text-center text-[11px] text-muted-foreground">
                      No files in this collection.
                    </div>
                  ) : (
                    collectionFiles.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/80">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-1.5 pt-2 border-t border-border/60">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onTriggerUpload}
                    disabled={isIndexing}
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload</span>
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={onOpenIndexDialog}
                    disabled={isIndexing || collectionFiles.length === 0}
                  >
                    <RefreshCw
                      className={cn("h-3 w-3", isIndexing && "animate-spin")}
                    />
                    <span>
                      {isIndexing
                        ? "Indexing..."
                        : selectedColObj.indexed
                        ? "Re-index"
                        : "Index"}
                    </span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ════════════════════════════════════════════════════════════ */
          /* THREADS (CHATS) VIEW                                        */
          /* ════════════════════════════════════════════════════════════ */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-3.5 py-2">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Session History ({chats.length})
              </span>
              <button
                type="button"
                onClick={onCreateNewChat}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              >
                <MessageSquarePlus className="h-3 w-3" />
                <span>New Thread</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2.5 space-y-0.5 scrollbar-thin">
              {chats.length === 0 ? (
                <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                  No active chat threads.
                </div>
              ) : (
                chats.map((chat) => {
                  const isActive = chat.id === activeChatId;
                  const col = collections.find(
                    (c) => c.safe_name === chat.collection
                  );

                  return (
                    <div
                      key={chat.id}
                      onClick={() => onSelectChat(chat.id)}
                      className={cn(
                        "group flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs transition-colors",
                        isActive
                          ? "bg-surface-hover text-foreground font-medium"
                          : "text-muted-foreground hover:bg-surface-hover/60 hover:text-foreground"
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        {editingChatId === chat.id ? (
                          <input
                            type="text"
                            value={chatTitleDraft}
                            onChange={(e) => setChatTitleDraft(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                void handleCommitChatRename(chat.id);
                              }
                              if (e.key === "Escape") {
                                setEditingChatId(null);
                              }
                            }}
                            onBlur={() => void handleCommitChatRename(chat.id)}
                            autoFocus
                            className="w-full rounded-xs border border-border-strong bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
                          />
                        ) : (
                          <div className="truncate text-xs text-foreground">
                            {chat.title}
                          </div>
                        )}

                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-xs"
                            style={{
                              backgroundColor: col?.color || "#71717a",
                            }}
                          />
                          <span className="truncate">
                            {col?.name || chat.collection}
                          </span>
                          {chat.updated_at && (
                            <>
                              <span>·</span>
                              <span className="shrink-0 tabular-nums">
                                {formatRelativeTime(chat.updated_at)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                            aria-label="Thread options"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setChatTitleDraft(chat.title);
                              setEditingChatId(chat.id);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                            <span>Rename Thread</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-danger focus:text-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDeleteChat(chat.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete Thread</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </aside>
    );
  }
);
AppSidebar.displayName = "AppSidebar";

