/**
 * Strict Domain & API Contract Types for SILO Agentic RAG
 * Maps 1:1 with the FastAPI + LangGraph + Qdrant backend models.
 */

export interface CollectionFile {
  name: string;
  size: number;
  type: string;
}

export interface CollectionSummary {
  name: string;
  safe_name: string;
  description: string;
  color: string;
  file_count: number;
  files: string[];
  indexed: boolean;
}

export interface CollectionDetail {
  name: string;
  safe_name: string;
  description: string;
  color: string;
  files: CollectionFile[];
  file_count: number;
  indexed: boolean;
}

export interface CreateCollectionPayload {
  name: string;
  description: string;
  color: string;
}

export interface UpdateCollectionPayload {
  color?: string;
  description?: string;
}

export type IngestionStage =
  | "loading"
  | "chunking"
  | "enriching"
  | "embedding"
  | "storing"
  | "ready"
  | "error"
  | "unindexed";

export interface IngestionStatusResponse {
  status: "indexing" | "ready" | "error" | "unindexed";
  stage?: IngestionStage;
  progress?: number;
  message?: string;
  documents_indexed?: number;
  smart_mode?: boolean;
}

export interface SourceMetadata {
  url?: string;
  title?: string;
  file_name?: string;
  page_label?: string;
  collection?: string;
  document_title?: string;
  excerpt_keywords?: string;
  [key: string]: unknown;
}

export interface SourceCitation {
  text: string;
  score: number;
  metadata: SourceMetadata;
  type: "local" | "web";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  sources?: SourceCitation[];
  isStreaming?: boolean;
  error?: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  collection: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp?: string;
    sources?: SourceCitation[];
  }>;
}

export interface OllamaModelTag {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
}

export interface AppSettings {
  chat_model: string;
  ingestion_model: string;
  strict_mode: boolean;
}

export interface SystemRamResponse {
  total_gb: number;
  available_gb: number;
  percent_used: number;
  is_warning: boolean;
}

/**
 * Discriminated union of Server-Sent Event payloads emitted by
 * POST /api/chats/{chat_id}/message?stream=true
 */
export type StreamChunkEvent =
  | {
      type: "status";
      status: string;
    }
  | {
      type: "sources";
      sources: SourceCitation[];
    }
  | {
      type: "token";
      token: string;
    }
  | {
      type: "clear";
    }
  | {
      type: "done";
      chat_title: string;
    }
  | {
      type: "error";
      message: string;
    };

export interface PipelineStepInfo {
  rawStatus: string;
  displayLabel: string;
  phase: "retrieve" | "rerank" | "web" | "verify" | "rewrite" | "synthesize";
}

