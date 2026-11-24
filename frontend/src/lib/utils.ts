import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PipelineStepInfo } from "@/types/api";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeTime(isoDate: string | undefined): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Normalizes raw LangGraph node status strings into transparent,
 * precision-engineered micro-copy without gimmicky jargon.
 */
export function resolvePipelineStatus(rawStatus: string | null): PipelineStepInfo | null {
  if (!rawStatus) return null;
  const lower = rawStatus.toLowerCase();

  if (lower.includes("searching local") || lower.includes("retrieve")) {
    return {
      rawStatus,
      displayLabel: "Retrieving context from vector index...",
      phase: "retrieve",
    };
  }
  if (lower.includes("grading relevance") || lower.includes("rerank")) {
    return {
      rawStatus,
      displayLabel: "Re-ranking & grading source relevance...",
      phase: "rerank",
    };
  }
  if (lower.includes("searching the web") || lower.includes("web")) {
    return {
      rawStatus,
      displayLabel: "Querying web fallback for supplementary context...",
      phase: "web",
    };
  }
  if (lower.includes("verifying") || lower.includes("factuality")) {
    return {
      rawStatus,
      displayLabel: "Verifying response grounding against sources...",
      phase: "verify",
    };
  }
  if (lower.includes("hallucination") || lower.includes("rewriting")) {
    return {
      rawStatus,
      displayLabel: "Refining search query and re-retrieving context...",
      phase: "rewrite",
    };
  }
  if (lower.includes("synthesizing")) {
    return {
      rawStatus,
      displayLabel: "Synthesizing response...",
      phase: "synthesize",
    };
  }

  return {
    rawStatus,
    displayLabel: rawStatus,
    phase: "retrieve",
  };
}

export const COLLECTION_COLOR_SWATCHES = [
  "#71717a", // Zinc
  "#64748b", // Slate
  "#3b82f6", // Blue
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#ef4444", // Red
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#14b8a6", // Teal
] as const;

