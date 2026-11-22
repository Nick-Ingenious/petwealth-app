"use client";

import { useState, useTransition } from "react";
import { Button } from "@petwealth/ui";
import { retryLabelAction } from "./kit-actions";

export function RetryLabel({ customerId, shipmentId }: { customerId: string; shipmentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await retryLabelAction(customerId, shipmentId);
            setError(!r.ok ? r.error : r.data.status === "failed" ? (r.data.error ?? "Still failing") : null);
          })
        }
      >
        {pending ? "Retrying…" : "Retry label"}
      </Button>
      {error ? <span className="max-w-xs text-right text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
