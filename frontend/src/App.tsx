import * as React from "react";
import { AlertTriangle, Upload, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TopBar } from "@/components/layout/TopBar";
import {
  CreateCollectionDialog,
  EditCollectionDialog,
  IndexingStrategyDialog,
} from "@/components/layout/CollectionDialogs";
import { SettingsDialog } from "@/components/layout/SettingsDialog";
import { ChatCanvas } from "@/components/chat/ChatCanvas";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { useSSEChat } from "@/hooks/use-sse-chat";
import { useIngestionPoller } from "@/hooks/use-ingestion-poller";
import { apiClient } from "@/lib/api-client";
import type {
  AppSettings,
  ChatMessage,
  ChatSessionSummary,
  CollectionFile,
  CollectionSummary,
  OllamaModelTag,
  SystemRamResponse,
} from "@/types/api";

export function App() {
  // ── UI & Layout State ──────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [sidebarTab, setSidebarTab] = React.useState<"collections" | "chats">(
    "collections"
  );
  const [theme, setTheme] = React.useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("silo_theme");
    return saved === "light" ? "light" : "dark";
  });

  // ── Domain State ───────────────────────────────────────────
  const [collections, setCollections] = React.useState<CollectionSummary[]>([]);
  const [activeCollection, setActiveCollection] = React.useState<string | null>(
    null
  );
  const [collectionFiles, setCollectionFiles] = React.useState<
    CollectionFile[]
  >([]);

  const [chats, setChats] = React.useState<ChatSessionSummary[]>([]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [onlineMode, setOnlineMode] = React.useState<boolean>(false);

  const [models, setModels] = React.useState<OllamaModelTag[]>([]);
  const [settings, setSettings] = React.useState<AppSettings>({
    chat_model: "llama3.1:8b",
    ingestion_model: "llama3.2:1b",
    strict_mode: false,
  });

  // ── Dialog Visibility ──────────────────────────────────────
  const [createCollectionOpen, setCreateCollectionOpen] = React.useState(false);
  const [editingCollection, setEditingCollection] =
    React.useState<CollectionSummary | null>(null);
  const [indexingDialogOpen, setIndexingDialogOpen] = React.useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = React.useState(false);

  // ── Drag & Drop Overlay State ──────────────────────────────
  const [isDraggingFiles, setIsDraggingFiles] = React.useState(false);
  const dragDepthRef = React.useRef(0);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Sync theme class on <html>
  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("theme-light");
    } else {
      root.classList.remove("dark");
      root.classList.add("theme-light");
    }
    localStorage.setItem("silo_theme", theme);
  }, [theme]);

  // ── Data Fetching Helpers ──────────────────────────────────
  const refreshCollections = React.useCallback(async () => {
    try {
      const list = await apiClient.listCollections();
      setCollections(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const refreshCollectionDetails = React.useCallback(
    async (safeName: string) => {
      try {
        const detail = await apiClient.getCollection(safeName);
        setCollectionFiles(detail.files || []);
      } catch {
        setCollectionFiles([]);
      }
    },
    []
  );

  const refreshChats = React.useCallback(async () => {
    try {
      const list = await apiClient.listChats();
      setChats(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  // ── Streaming Chat Hook ────────────────────────────────────
  const handleChatCreatedFromStream = React.useCallback(
    async (newChatId: string, collection: string) => {
      setActiveChatId(newChatId);
      setActiveCollection(collection);
      await refreshChats();
      setSidebarTab("chats");
    },
    [refreshChats]
  );

  const handleChatTitleUpdated = React.useCallback(
    (chatId: string, newTitle: string) => {
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c))
      );
    },
    []
  );

  const {
    messages,
    setMessages,
    isStreaming,
    pipelineStatus,
    sendMessage,
    stopGeneration,
  } = useSSEChat({
    activeChatId,
    activeCollection,
    onChatCreated: handleChatCreatedFromStream,
    onChatTitleUpdated: handleChatTitleUpdated,
  });

  // ── RAM & Resource Pressure State ─────────────────────────
  const [ramStatus, setRamStatus] = React.useState<SystemRamResponse | null>(null);
  const [ramWarningDismissed, setRamWarningDismissed] = React.useState<boolean>(false);

  // Periodically check system RAM pressure (every 12 seconds)
  React.useEffect(() => {
    let cancelled = false;
    async function checkRam() {
      try {
        const ram = await apiClient.getSystemRam();
        if (!cancelled) {
          setRamStatus(ram);
        }
      } catch {
        // Soft fail if system endpoint is unavailable
      }
    }
    void checkRam();
    const interval = window.setInterval(checkRam, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // ── Ingestion Poller Hook ──────────────────────────────────
  const handleIngestionComplete = React.useCallback(
    (safeName: string) => {
      void refreshCollections();
      void refreshCollectionDetails(safeName);
    },
    [refreshCollectionDetails, refreshCollections]
  );

  const {
    ingestionStatus,
    isIndexing,
    justCompleted,
    dismissCompleted,
    triggerIngestion,
  } = useIngestionPoller({
    activeCollection,
    onIngestionComplete: handleIngestionComplete,
  });

  // ── Selection Actions ──────────────────────────────────────
  const selectCollection = React.useCallback(
    async (safeName: string) => {
      stopGeneration();
      setActiveCollection(safeName);
      setActiveChatId(null);
      setMessages([]);
      await refreshCollectionDetails(safeName);
    },
    [refreshCollectionDetails, setMessages, stopGeneration]
  );

  const selectChat = React.useCallback(
    async (chatId: string) => {
      stopGeneration();
      setActiveChatId(chatId);
      try {
        const detail = await apiClient.getChat(chatId);
        setActiveCollection(detail.collection);
        const mappedMessages: ChatMessage[] = (detail.messages || []).map(
          (m, idx) => ({
            id: `${chatId}-${idx}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            sources: m.sources || [],
          })
        );
        setMessages(mappedMessages);
        await refreshCollectionDetails(detail.collection);
      } catch {
        setMessages([]);
      }
    },
    [refreshCollectionDetails, setMessages, stopGeneration]
  );

  // ── Initial Bootstrapping ──────────────────────────────────
  React.useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const [fetchedModels, fetchedSettings, fetchedCollections, fetchedChats] =
        await Promise.all([
          apiClient.getModels().catch(() => [] as OllamaModelTag[]),
          apiClient.getSettings().catch(() => null),
          refreshCollections(),
          refreshChats(),
        ]);

      if (!mounted) return;

      setModels(fetchedModels);
      if (fetchedSettings) {
        setSettings(fetchedSettings);
      }

      const firstChat = fetchedChats[0];
      const firstCol = fetchedCollections[0];

      if (firstChat) {
        setSidebarTab("chats");
        await selectChat(firstChat.id);
      } else if (firstCol) {
        setSidebarTab("collections");
        await selectCollection(firstCol.safe_name);
      }
    }

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshChats, refreshCollections, selectChat, selectCollection]);

  // ── Collection & Chat Mutations ────────────────────────────
  const handleCreateCollection = React.useCallback(
    async (payload: { name: string; description: string; color: string }) => {
      const created = await apiClient.createCollection(payload);
      await refreshCollections();
      await selectCollection(created.safe_name);
      setSidebarTab("collections");
    },
    [refreshCollections, selectCollection]
  );

  const handleUpdateCollection = React.useCallback(
    async (
      safeName: string,
      payload: { description: string; color: string }
    ) => {
      await apiClient.updateCollection(safeName, payload);
      await refreshCollections();
    },
    [refreshCollections]
  );

  const handleDeleteCollection = React.useCallback(
    async (safeName: string) => {
      await apiClient.deleteCollection(safeName);
      // Clean up associated chats
      const associatedChats = chats.filter((c) => c.collection === safeName);
      for (const c of associatedChats) {
        await apiClient.deleteChat(c.id).catch(() => undefined);
      }

      const nextCols = await refreshCollections();
      await refreshChats();

      const fallbackCol = nextCols[0];
      if (fallbackCol) {
        await selectCollection(fallbackCol.safe_name);
      } else {
        setActiveCollection(null);
        setActiveChatId(null);
        setCollectionFiles([]);
        setMessages([]);
      }
    },
    [chats, refreshChats, refreshCollections, selectCollection, setMessages]
  );

  const handleCreateNewChat = React.useCallback(async () => {
    const targetCollection =
      activeCollection || collections[0]?.safe_name || null;
    if (!targetCollection) {
      setCreateCollectionOpen(true);
      return;
    }

    const created = await apiClient.createChat(targetCollection);
    await refreshChats();
    await selectChat(created.id);
    setSidebarTab("chats");
  }, [activeCollection, collections, refreshChats, selectChat]);

  const handleRenameChat = React.useCallback(
    async (chatId: string, newTitle: string) => {
      await apiClient.renameChat(chatId, newTitle);
      await refreshChats();
    },
    [refreshChats]
  );

  const handleDeleteChat = React.useCallback(
    async (chatId: string) => {
      if (activeChatId === chatId) {
        stopGeneration();
      }
      await apiClient.deleteChat(chatId);
      const nextChats = await refreshChats();

      if (activeChatId === chatId) {
        const nextActive = nextChats[0];
        if (nextActive) {
          await selectChat(nextActive.id);
        } else {
          setActiveChatId(null);
          setMessages([]);
        }
      }
    },
    [activeChatId, refreshChats, selectChat, setMessages, stopGeneration]
  );

  // ── File Upload & Drag-and-Drop ────────────────────────────
  const handleFilesSelected = React.useCallback(
    async (files: FileList | File[]) => {
      if (!activeCollection) {
        setCreateCollectionOpen(true);
        return;
      }
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      for (const file of fileArray) {
        await apiClient.uploadFile(activeCollection, file);
      }

      await refreshCollectionDetails(activeCollection);
      await refreshCollections();
      setSidebarTab("collections");
    },
    [activeCollection, refreshCollectionDetails, refreshCollections]
  );

  const handleWindowDragEnter = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingFiles(true);
    }
  }, []);

  const handleWindowDragLeave = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  }, []);

  const handleWindowDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await handleFilesSelected(e.dataTransfer.files);
      }
    },
    [handleFilesSelected]
  );

  const activeCollectionObj = React.useMemo(
    () => collections.find((c) => c.safe_name === activeCollection) || null,
    [collections, activeCollection]
  );

  const activeChatObj = React.useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId]
  );

  return (
    <TooltipProvider delayDuration={180}>
      <div
        onDragEnter={handleWindowDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={handleWindowDragLeave}
        onDrop={(e) => void handleWindowDrop(e)}
        className="relative flex h-screen w-screen overflow-hidden bg-background text-foreground"
      >
        {/* Left Navigation & Collection Inspector Rail */}
        <AppSidebar
          open={sidebarOpen}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          collections={collections}
          activeCollection={activeCollection}
          onSelectCollection={(safeName) => void selectCollection(safeName)}
          onOpenCreateCollection={() => setCreateCollectionOpen(true)}
          onOpenEditCollection={(col) => setEditingCollection(col)}
          collectionFiles={collectionFiles}
          onTriggerUpload={() => fileInputRef.current?.click()}
          onOpenIndexDialog={() => setIndexingDialogOpen(true)}
          ingestionStatus={ingestionStatus}
          isIndexing={isIndexing}
          justCompleted={justCompleted}
          onDismissCompleted={dismissCompleted}
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={(chatId) => void selectChat(chatId)}
          onCreateNewChat={() => void handleCreateNewChat()}
          onRenameChat={handleRenameChat}
          onDeleteChat={handleDeleteChat}
        />

        {/* Primary Workspace Column */}
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          <TopBar
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            activeCollection={activeCollectionObj}
            activeChat={activeChatObj}
            onRenameChat={handleRenameChat}
            theme={theme}
            onToggleTheme={() =>
              setTheme((prev) => (prev === "dark" ? "light" : "dark"))
            }
            onOpenSettings={() => setSettingsDialogOpen(true)}
          />

          {/* Minimalist RAM Pressure Advisory */}
          {ramStatus?.is_warning && !ramWarningDismissed && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 select-none transition-all duration-200">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  <strong className="font-semibold">
                    High Memory Usage ({ramStatus.percent_used}% · {ramStatus.available_gb} GB free):
                  </strong>{" "}
                  Consider closing background browser tabs or switching to a lighter model in Settings to prevent memory pressure.
                </span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSettingsDialogOpen(true)}
                  className="font-medium underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => setRamWarningDismissed(true)}
                  className="rounded p-0.5 opacity-70 hover:opacity-100 hover:bg-amber-500/20 transition-all cursor-pointer"
                  aria-label="Dismiss memory warning"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <ChatCanvas
            messages={messages}
            isStreaming={isStreaming}
            pipelineStatus={pipelineStatus}
            activeCollection={activeCollectionObj}
            onSelectPrompt={(prompt) => void sendMessage(prompt, onlineMode)}
            onOpenCreateCollection={() => setCreateCollectionOpen(true)}
            onTriggerUpload={() => fileInputRef.current?.click()}
          />

          <ChatComposer
            onSend={sendMessage}
            onStop={stopGeneration}
            onTriggerUpload={() => fileInputRef.current?.click()}
            isStreaming={isStreaming}
            disabled={!activeCollection && !activeChatId}
            activeCollectionName={activeCollectionObj?.name ?? null}
            onlineMode={onlineMode}
            onOnlineModeChange={setOnlineMode}
          />
        </main>

        {/* Hidden Native File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }
          }}
        />

        {/* Drag-and-Drop File Ingestion Overlay */}
        {isDraggingFiles && (
          <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/85 backdrop-blur-xs">
            <div className="flex flex-col items-center rounded-lg border border-dashed border-border-strong bg-surface-elevated px-10 py-8 text-center shadow-2xl">
              <Upload className="h-6 w-6 text-foreground mb-2.5" />
              <p className="text-sm font-semibold text-foreground">
                Drop files to upload to{" "}
                {activeCollectionObj?.name || "active collection"}
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Supported formats: PDF, TXT, MD, CSV
              </p>
            </div>
          </div>
        )}

        {/* Modals / Dialogs */}
        <CreateCollectionDialog
          open={createCollectionOpen}
          onOpenChange={setCreateCollectionOpen}
          onCreate={handleCreateCollection}
        />

        <EditCollectionDialog
          collection={editingCollection}
          open={Boolean(editingCollection)}
          onOpenChange={(open) => {
            if (!open) setEditingCollection(null);
          }}
          onUpdate={handleUpdateCollection}
          onDelete={handleDeleteCollection}
        />

        <IndexingStrategyDialog
          open={indexingDialogOpen}
          onOpenChange={setIndexingDialogOpen}
          isReindex={Boolean(activeCollectionObj?.indexed)}
          onStartIndexing={async (smartMode) => {
            if (activeCollection) {
              await triggerIngestion(activeCollection, smartMode);
            }
          }}
        />

        <SettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          models={models}
          settings={settings}
          onSaveSettings={async (nextSettings) => {
            const updated = await apiClient.updateSettings(nextSettings);
            setSettings(updated);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
export default App;

