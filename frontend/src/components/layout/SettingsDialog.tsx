import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AppSettings, OllamaModelTag } from "@/types/api";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: OllamaModelTag[];
  settings: AppSettings;
  onSaveSettings: (nextSettings: AppSettings) => Promise<void>;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  models,
  settings,
  onSaveSettings,
}) => {
  const [chatModel, setChatModel] = React.useState(settings.chat_model);
  const [ingestionModel, setIngestionModel] = React.useState(
    settings.ingestion_model
  );
  const [strictMode, setStrictMode] = React.useState(settings.strict_mode);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setChatModel(settings.chat_model);
      setIngestionModel(settings.ingestion_model);
      setStrictMode(settings.strict_mode);
    }
  }, [open, settings]);

  const modelNames = React.useMemo(() => {
    const set = new Set<string>();
    models.forEach((m) => {
      if (m.name) set.add(m.name);
    });
    if (settings.chat_model) set.add(settings.chat_model);
    if (settings.ingestion_model) set.add(settings.ingestion_model);
    if (set.size === 0) {
      set.add("llama3.1:8b");
      set.add("llama3.2:1b");
    }
    return Array.from(set);
  }, [models, settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings({
        chat_model: chatModel,
        ingestion_model: ingestionModel,
        strict_mode: strictMode,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inference & Pipeline Settings</DialogTitle>
          <DialogDescription>
            Configure local Ollama models and LangGraph verification policies.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label
              htmlFor="settings-chat-model"
              className="block text-xs font-medium text-foreground"
            >
              Primary Reasoning & Synthesis Model
            </label>
            <select
              id="settings-chat-model"
              value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-surface px-2.5 font-mono text-xs text-foreground focus:border-border-strong focus:outline-none"
            >
              {modelNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Executes query synthesis, document relevance grading, and query
              rewriting.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="settings-ingest-model"
              className="block text-xs font-medium text-foreground"
            >
              Contextual Ingestion Model
            </label>
            <select
              id="settings-ingest-model"
              value={ingestionModel}
              onChange={(e) => setIngestionModel(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-surface px-2.5 font-mono text-xs text-foreground focus:border-border-strong focus:outline-none"
            >
              {modelNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Lightweight model invoked during LLM-enriched indexing for chunk
              title and keyword extraction.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface p-3">
            <div className="space-y-1">
              <label
                htmlFor="settings-strict-switch"
                className="block text-xs font-medium text-foreground cursor-pointer"
              >
                Self-RAG Grounding Verification
              </label>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Audits generated answers against retrieved passages before
                streaming. Automatically rewrites the query and re-retrieves if
                unsupported claims are detected.
              </p>
            </div>
            <Switch
              id="settings-strict-switch"
              checked={strictMode}
              onCheckedChange={setStrictMode}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Apply Configuration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

