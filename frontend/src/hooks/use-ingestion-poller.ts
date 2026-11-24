import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { IngestionStatusResponse } from "@/types/api";

interface UseIngestionPollerOptions {
  activeCollection: string | null;
  onIngestionComplete?: (safeName: string) => void;
}

export function useIngestionPoller({
  activeCollection,
  onIngestionComplete,
}: UseIngestionPollerOptions) {
  const [statusData, setStatusData] = useState<IngestionStatusResponse | null>(null);
  const [justCompleted, setJustCompleted] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const isTrackingActiveIndexingRef = useRef<boolean>(false);
  const onIngestionCompleteRef = useRef(onIngestionComplete);

  // Keep latest callback ref without resetting hook effects
  useEffect(() => {
    onIngestionCompleteRef.current = onIngestionComplete;
  }, [onIngestionComplete]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (safeName: string) => {
      clearTimer();
      try {
        const res = await apiClient.getIngestionStatus(safeName);

        if (res.status === "indexing") {
          isTrackingActiveIndexingRef.current = true;
          setJustCompleted(false);
          setStatusData(res);
          timerRef.current = window.setTimeout(() => {
            void pollStatus(safeName);
          }, 800);
        } else if (res.status === "ready") {
          if (isTrackingActiveIndexingRef.current) {
            isTrackingActiveIndexingRef.current = false;
            setStatusData({
              status: "ready",
              stage: "ready",
              progress: 100,
              message: res.message || "Successfully indexed all documents!",
            });
            setJustCompleted(true);

            // Trigger auto-refresh of collection metadata immediately
            onIngestionCompleteRef.current?.(safeName);

            clearCompletionTimer();
            completionTimerRef.current = window.setTimeout(() => {
              setJustCompleted(false);
            }, 6000);
          } else {
            setStatusData(res);
          }
        } else if (res.status === "error") {
          isTrackingActiveIndexingRef.current = false;
          setJustCompleted(false);
          setStatusData(res);
        } else {
          setStatusData(res);
        }
      } catch {
        if (isTrackingActiveIndexingRef.current) {
          timerRef.current = window.setTimeout(() => {
            void pollStatus(safeName);
          }, 1500);
        }
      }
    },
    [clearCompletionTimer, clearTimer]
  );

  const triggerIngestion = useCallback(
    async (safeName: string, smartMode: boolean) => {
      clearCompletionTimer();
      setJustCompleted(false);
      isTrackingActiveIndexingRef.current = true;
      setStatusData({
        status: "indexing",
        stage: "loading",
        progress: 5,
        message: "Initializing document pipeline...",
        smart_mode: smartMode,
      });

      await apiClient.startIngestion(safeName, smartMode);
      await pollStatus(safeName);
    },
    [clearCompletionTimer, pollStatus]
  );

  useEffect(() => {
    clearTimer();
    clearCompletionTimer();
    isTrackingActiveIndexingRef.current = false;
    setJustCompleted(false);

    if (!activeCollection) {
      setStatusData(null);
      return;
    }
    void pollStatus(activeCollection);

    return () => {
      clearTimer();
      clearCompletionTimer();
    };
  }, [activeCollection, clearCompletionTimer, clearTimer, pollStatus]);

  return {
    ingestionStatus: statusData,
    isIndexing: statusData?.status === "indexing",
    justCompleted,
    dismissCompleted: () => setJustCompleted(false),
    triggerIngestion,
    refreshStatus: () =>
      activeCollection ? pollStatus(activeCollection) : Promise.resolve(),
  };
}
