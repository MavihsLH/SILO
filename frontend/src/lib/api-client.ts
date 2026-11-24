import type {
  AppSettings,
  ChatSessionDetail,
  ChatSessionSummary,
  CollectionDetail,
  CollectionSummary,
  CreateCollectionPayload,
  IngestionStatusResponse,
  OllamaModelTag,
  UpdateCollectionPayload,
} from "@/types/api";

class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload?.detail) detail = payload.detail;
    } catch {
      // Fallback to statusText
    }
    throw new ApiError(detail || `HTTP ${response.status}`, response.status);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  // ── Models & Settings ─────────────────────────────────────
  getModels: () => request<OllamaModelTag[]>("/models"),
  getSettings: () => request<AppSettings>("/settings"),
  getSystemRam: () =>
    request<import("@/types/api").SystemRamResponse>("/system/ram"),
  updateSettings: (payload: AppSettings) =>
    request<AppSettings>("/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ── Collections ───────────────────────────────────────────
  listCollections: () => request<CollectionSummary[]>("/collections"),
  getCollection: (safeName: string) =>
    request<CollectionDetail>(`/collections/${encodeURIComponent(safeName)}`),
  createCollection: (payload: CreateCollectionPayload) =>
    request<CollectionSummary>("/collections", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCollection: (safeName: string, payload: UpdateCollectionPayload) =>
    request<CollectionSummary>(`/collections/${encodeURIComponent(safeName)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCollection: (safeName: string) =>
    request<{ status: string }>(`/collections/${encodeURIComponent(safeName)}`, {
      method: "DELETE",
    }),

  // ── File Upload & Ingestion ───────────────────────────────
  uploadFile: async (safeName: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `/api/collections/${encodeURIComponent(safeName)}/upload`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = (await response.json()) as { detail?: string };
        if (payload?.detail) detail = payload.detail;
      } catch {
        // Ignore parse error
      }
      throw new ApiError(detail || "File upload failed", response.status);
    }

    return response.json() as Promise<{
      filename: string;
      size: number;
      path: string;
      status: string;
    }>;
  },

  startIngestion: (safeName: string, smartMode: boolean) =>
    request<{ status: string; smart_mode: boolean }>(
      `/collections/${encodeURIComponent(safeName)}/ingest`,
      {
        method: "POST",
        body: JSON.stringify({ smart_mode: smartMode }),
      }
    ),

  getIngestionStatus: (safeName: string) =>
    request<IngestionStatusResponse>(
      `/collections/${encodeURIComponent(safeName)}/status`
    ),

  // ── Multi-Chat Sessions ───────────────────────────────────
  listChats: () => request<ChatSessionSummary[]>("/chats"),
  getChat: (chatId: string) =>
    request<ChatSessionDetail>(`/chats/${encodeURIComponent(chatId)}`),
  createChat: (collection: string, title?: string) =>
    request<ChatSessionDetail>("/chats", {
      method: "POST",
      body: JSON.stringify({ collection, title }),
    }),
  renameChat: (chatId: string, title: string) =>
    request<ChatSessionDetail>(`/chats/${encodeURIComponent(chatId)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteChat: (chatId: string) =>
    request<{ status: string }>(`/chats/${encodeURIComponent(chatId)}`, {
      method: "DELETE",
    }),
};

