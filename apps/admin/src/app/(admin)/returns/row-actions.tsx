"use client";

import { useState, useTransition } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@petwealth/ui";
import { refreshTrackingAction, retryReturnAction } from "./actions";

/** Retry a failed FedEx code, or refresh tracking for a mailer that has one. */
export function ReturnRowActions({ id, status, hasTracking, canManage }: { id: string; status: string; hasTracking: boolean; canManage: boolean }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!canManage) return null;
  const canRetry = status === "failed" || status === "pending";
  const canRefresh = hasTracking && (status === "label_created" || status === "in_transit" || status === "exception");
  return (
    <div className="flex flex-col items-end gap-1">
      {canRetry ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await retryReturnAction(id);
              setMessage(r.ok ? { ok: true, text: "Retried." } : { ok: false, text: r.error });
            })
          }
        >
          <RotateCcw className="size-3.5" aria-hidden /> {pending ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
      {canRefresh ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          aria-label="Refresh tracking"
          onClick={() =>
            start(async () => {
              const r = await refreshTrackingAction(id);
              setMessage(r.ok ? { ok: true, text: r.data.changed ? "Updated." : "No change." } : { ok: false, text: r.error });
            })
          }
        >
          <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
        </Button>
      ) : null}
      {message ? <p className={message.ok ? "whitespace-nowrap text-xs text-emerald-700" : "max-w-48 text-right text-xs text-red-600"}>{message.text}</p> : null}
    </div>
  );
}
