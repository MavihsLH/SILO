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
import { cn, COLLECTION_COLOR_SWATCHES } from "@/lib/utils";
import type { CollectionSummary } from "@/types/api";

/* ────────────────────────────────────────────────────────────── */
/* CREATE COLLECTION DIALOG                                      */
/* ────────────────────────────────────────────────────────────── */

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: {
    name: string;
    description: string;
    color: string;
  }) => Promise<void>;
}

export const CreateCollectionDialog: React.FC<CreateCollectionDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
}) => {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<string>(COLLECTION_COLOR_SWATCHES[3]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setColor(COLLECTION_COLOR_SWATCHES[3]);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Collection name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: trimmed,
        description: description.trim(),
        color,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Knowledge Collection</DialogTitle>
          <DialogDescription>
            Create an isolated Qdrant vector namespace for your documents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label
              htmlFor="col-name"
              className="block text-xs font-medium text-foreground"
            >
              Collection Name
            </label>
            <input
              id="col-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Systems Architecture Papers"
              autoFocus
              className="h-8 w-full rounded-md border border-border bg-surface px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="col-desc"
              className="block text-xs font-medium text-foreground"
            >
              Description <span className="text-muted-foreground">(Optional)</span>
            </label>
            <textarea
              id="col-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope and document types stored in this collection..."
              className="w-full resize-none rounded-md border border-border bg-surface p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-border-strong focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Identifier Tag Color
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {COLLECTION_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={cn(
                    "h-5 w-5 rounded-sm transition-transform",
                    color === swatch
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface-elevated scale-105"
                      : "opacity-75 hover:opacity-100"
                  )}
                  style={{ backgroundColor: swatch }}
                  aria-label={`Select color ${swatch}`}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Collection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/* ────────────────────────────────────────────────────────────── */
/* EDIT / DELETE COLLECTION DIALOG                               */
/* ────────────────────────────────────────────────────────────── */

interface EditCollectionDialogProps {
  collection: CollectionSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (
    safeName: string,
    payload: { description: string; color: string }
  ) => Promise<void>;
  onDelete: (safeName: string) => Promise<void>;
}

export const EditCollectionDialog: React.FC<EditCollectionDialogProps> = ({
  collection,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
}) => {
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<string>("#6366f1");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (collection && open) {
      setDescription(collection.description || "");
      setColor(collection.color || "#6366f1");
      setConfirmingDelete(false);
    }
  }, [collection, open]);

  if (!collection) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onUpdate(collection.safe_name, {
        description: description.trim(),
        color,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    setSubmitting(true);
    try {
      await onDelete(collection.safe_name);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Collection</DialogTitle>
          <DialogDescription>
            Update metadata or remove the{" "}
            <span className="font-mono text-foreground">{collection.name}</span>{" "}
            vector index.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              Collection Identifier (Immutable)
            </label>
            <input
              type="text"
              value={collection.name}
              disabled
              className="h-8 w-full rounded-md border border-border bg-muted px-3 text-xs text-muted-foreground cursor-not-allowed"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-col-desc"
              className="block text-xs font-medium text-foreground"
            >
              Description
            </label>
            <textarea
              id="edit-col-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-md border border-border bg-surface p-2.5 text-xs text-foreground focus:border-border-strong focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Identifier Tag Color
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {COLLECTION_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  className={cn(
                    "h-5 w-5 rounded-sm transition-transform",
                    color === swatch
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface-elevated scale-105"
                      : "opacity-75 hover:opacity-100"
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </div>

          {confirmingDelete ? (
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3 space-y-2">
              <p className="text-xs text-danger font-medium">
                Permanently delete "{collection.name}", all uploaded files, and
                associated Qdrant vectors?
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={submitting}
                  onClick={() => void handleConfirmDelete()}
                >
                  Confirm Delete
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete Collection
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};

/* ────────────────────────────────────────────────────────────── */
/* INDEXING STRATEGY DIALOG                                      */
/* ────────────────────────────────────────────────────────────── */

interface IndexingStrategyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReindex: boolean;
  onStartIndexing: (smartMode: boolean) => Promise<void>;
}

export const IndexingStrategyDialog: React.FC<IndexingStrategyDialogProps> = ({
  open,
  onOpenChange,
  isReindex,
  onStartIndexing,
}) => {
  const [smartMode, setSmartMode] = React.useState(false);

  const handleConfirm = async () => {
    onOpenChange(false);
    await onStartIndexing(smartMode);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReindex ? "Re-index Vector Collection" : "Index Vector Collection"}
          </DialogTitle>
          <DialogDescription>
            Select the document chunking and metadata extraction pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 py-1">
          <button
            type="button"
            onClick={() => setSmartMode(false)}
            className={cn(
              "flex w-full flex-col items-start rounded-md border p-3 text-left transition-colors",
              !smartMode
                ? "border-foreground bg-surface"
                : "border-border bg-transparent hover:bg-surface/60"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Standard Hybrid Chunking
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Fast · BGE-Small + Sparse
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Splits documents into overlapping passages and computes dense +
              sparse hybrid vectors directly. Optimal for rapid iteration.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSmartMode(true)}
            className={cn(
              "flex w-full flex-col items-start rounded-md border p-3 text-left transition-colors",
              smartMode
                ? "border-foreground bg-surface"
                : "border-border bg-transparent hover:bg-surface/60"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                LLM-Enriched Contextual Indexing
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Deep · Title & Keyword Extraction
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Runs the secondary local ingestion LLM across chunks to synthesize
              structural titles and keyword metadata before embedding.
            </p>
          </button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleConfirm()}>
            {isReindex ? "Start Re-indexing" : "Start Indexing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

