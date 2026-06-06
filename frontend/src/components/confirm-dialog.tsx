import { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2, Trash2, X } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  saveLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  saving?: boolean;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onSave?: () => void | Promise<void>;
  children?: ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  saveLabel,
  cancelLabel = "Abbrechen",
  loading = false,
  saving = false,
  destructive = true,
  onOpenChange,
  onConfirm,
  onSave,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {children}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
            {cancelLabel}
          </Button>
          {onSave && saveLabel ? (
            <Button
              type="button"
              variant="default"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              <span>{saving ? `${saveLabel} ...` : saveLabel}</span>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={destructive ? "destructive" : "outline"}
            onClick={() => void onConfirm()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : destructive ? (
              <Trash2 className="size-4" />
            ) : null}
            <span>{loading ? `${confirmLabel} ...` : confirmLabel}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
