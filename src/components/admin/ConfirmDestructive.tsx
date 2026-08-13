import { useState, type ReactNode } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDestructiveProps {
  /** Trigger element rendered by the caller. */
  children: ReactNode;
  title: string;
  description: ReactNode;
  /** Action label on the confirm button. */
  confirmLabel: string;
  /**
   * When provided, the admin must type this exact string before the confirm
   * button unlocks. Use for irreversible or money-moving actions.
   */
  typeToConfirm?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirmation gate for destructive admin actions.
 *
 * This is a UI safeguard only — the authoritative checks live in the database
 * (admin role checks inside SECURITY DEFINER RPCs, RLS policies, and the
 * per-minute admin write throttle). Never rely on this component alone.
 */
export function ConfirmDestructive({
  children,
  title,
  description,
  confirmLabel,
  typeToConfirm,
  onConfirm,
}: ConfirmDestructiveProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const unlocked = !typeToConfirm || typed.trim() === typeToConfirm;

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
      setTyped("");
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <button type="button" onClick={() => setOpen(true)} className="contents">
        {children}
      </button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>{description}</div>
              <div className="text-xs">
                This action is recorded in the admin audit log against your account.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {typeToConfirm && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Type <code className="px-1 rounded bg-secondary">{typeToConfirm}</code> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={!unlocked || pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
