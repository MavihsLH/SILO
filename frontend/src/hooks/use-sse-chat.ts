import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type {
  ChatMessage,
  SourceCitation,
  StreamChunkEvent,
} from "@/types/api";

interface UseSSEChatOptions {
  activeChatId: string | null;
  activeCollection: string | null;
  onChatCreated?: (newChatId: string, collection: string) => Promise<void> | void;
  onChatTitleUpdated?: (chatId: string, newTitle: string) => void;
}

export interface UseSSEChatReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  isStreaming: boolean;
  pipelineStatus: string | null;
  sendMessage: (promptText: string, onlineMode: boolean) => Promise<void>;
  stopGeneration: () => void;
}

/**
 * High-frequency SSE streaming hook with requestAnimationFrame token batching.
 *
 * Architectural guarantees:
 * 1. Zero DOM thrashing: Incoming `token` deltas are accumulated in a mutable ref
 *    and flushed to React state at most once per animation frame (~16.6ms).
 * 2. Zero Layout Shift (CLS): Immediately reserves both the user turn and the
 *    assistant turn slot in `messages` before network I/O begins.
 * 3. Self-RAG (`strict_mode`) resilience: Handles `{"type": "clear"}` events
 *    by atomically resetting buffered and committed tokens when LangGraph
 *    detects a hallucination and rewrites the query.
 * 4. Strict lifecycle safety: Cancels in-flight `ReadableStream` via `AbortController`
 *    if the user switches chat sessions or triggers `stopGeneration()`.
 */
export function useSSEChat({
  activeChatId,
  activeCollection,
  onChatCreated,
  onChatTitleUpdated,
}: UseSSEChatOptions): UseSSEChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const accumulatedContentRef = useRef<string>("");
  const accumulatedSourcesRef = useRef<SourceCitation[]>([]);
  const activeAssistantMsgIdRef = useRef<string | null>(null);

  const cancelPendingRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const flushBufferedStreamState = useCallback(() => {
    rafIdRef.current = null;
    const targetId = activeAssistantMsgIdRef.current;
    if (!targetId) return;

    const snapshotContent = accumulatedContentRef.current;
    const snapshotSources = accumulatedSourcesRef.current;

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === targetId
          ? {
              ...msg,
              content: snapshotContent,
              sources: snapshotSources,
            }
          : msg
      )
    );
  }, []);

  const scheduleFrameFlush = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushBufferedStreamState);
    }
  }, [flushBufferedStreamState]);

  const stopGeneration = useCallback(() => {
    cancelPendingRaf();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    flushBufferedStreamState();
    const targetId = activeAssistantMsgIdRef.current;
    if (targetId) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === targetId ? { ...msg, isStreaming: false } : msg
        )
      );
    }
    activeAssistantMsgIdRef.current = null;
    setIsStreaming(false);
    setPipelineStatus(null);
  }, [cancelPendingRaf, flushBufferedStreamState]);

  // Abort any in-flight stream if the user switches to a different chat session
  useEffect(() => {
    return () => {
      cancelPendingRaf();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [activeChatId, cancelPendingRaf]);

  const sendMessage = useCallback(
    async (rawPrompt: string, onlineMode: boolean) => {
      const promptText = rawPrompt.trim();
      if (!promptText || isStreaming) return;

      let targetChatId = activeChatId;

      // Auto-provision a chat session if the user is querying directly from a collection view
      if (!targetChatId) {
        if (!activeCollection) {
          return;
        }
        const createdChat = await apiClient.createChat(activeCollection);
        targetChatId = createdChat.id;
        if (onChatCreated) {
          await onChatCreated(createdChat.id, activeCollection);
        }
      }

      const nowIso = new Date().toISOString();
      const userMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Reset stream accumulators
      accumulatedContentRef.current = "";
      accumulatedSourcesRef.current = [];
      activeAssistantMsgIdRef.current = assistantMessageId;

      // Pre-allocate both turns synchronously to prevent layout shifts (Zero CLS)
      const userTurn: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: promptText,
        timestamp: nowIso,
      };

      const assistantTurn: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: nowIso,
        sources: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userTurn, assistantTurn]);
      setIsStreaming(true);
      setPipelineStatus(
        onlineMode
          ? "Retrieving context from vector index..."
          : "Retrieving context..."
      );

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(
          `/api/chats/${encodeURIComponent(targetChatId)}/message?stream=true`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              message: promptText,
              online_mode: onlineMode,
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          let errDetail = response.statusText;
          try {
            const errJson = (await response.json()) as { detail?: string };
            if (errJson?.detail) errDetail = errJson.detail;
          } catch {
            // Ignore JSON parse fallback
          }
          throw new Error(errDetail || `Request failed (${response.status})`);
        }

        if (!response.body) {
          throw new Error("Streaming response body is unavailable.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let lineBuffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split("\n");
          lineBuffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || !line.startsWith("data:")) continue;

            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;

            let event: StreamChunkEvent;
            try {
              event = JSON.parse(jsonStr) as StreamChunkEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "status": {
                setPipelineStatus(event.status);
                break;
              }

              case "sources": {
                accumulatedSourcesRef.current = event.sources || [];
                scheduleFrameFlush();
                break;
              }

              case "clear": {
                // Triggered by LangGraph before streaming or when Self-RAG discards an ungrounded draft
                cancelPendingRaf();
                accumulatedContentRef.current = "";
                accumulatedSourcesRef.current = [];
                flushBufferedStreamState();
                break;
              }

              case "token": {
                // Transition telemetry label once first token arrives
                setPipelineStatus("Synthesizing response...");
                accumulatedContentRef.current += event.token;
                scheduleFrameFlush();
                break;
              }

              case "done": {
                cancelPendingRaf();
                flushBufferedStreamState();
                setPipelineStatus(null);
                if (event.chat_title && onChatTitleUpdated) {
                  onChatTitleUpdated(targetChatId, event.chat_title);
                }
                break;
              }

              case "error": {
                throw new Error(event.message || "Stream execution error");
              }
            }
          }
        }

        // Finalize buffered tokens
        cancelPendingRaf();
        flushBufferedStreamState();
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg
          )
        );
      } catch (err) {
        cancelPendingRaf();
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        const errMessage =
          err instanceof Error ? err.message : "Failed to generate response.";

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  isStreaming: false,
                  error: errMessage,
                  content:
                    accumulatedContentRef.current ||
                    `Unable to complete request: ${errMessage}`,
                }
              : msg
          )
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        activeAssistantMsgIdRef.current = null;
        setIsStreaming(false);
        setPipelineStatus(null);
      }
    },
    [
      activeChatId,
      activeCollection,
      cancelPendingRaf,
      flushBufferedStreamState,
      isStreaming,
      onChatCreated,
      onChatTitleUpdated,
      scheduleFrameFlush,
    ]
  );

  return {
    messages,
    setMessages,
    isStreaming,
    pipelineStatus,
    sendMessage,
    stopGeneration,
  };
}

