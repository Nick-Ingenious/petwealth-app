"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@petwealth/ui";
import { syncShopifyShippingAction, type SyncResult } from "./sync-actions";

/** Backfill: read ShipStation / Defender fulfilments from Shopify for orders still waiting to ship. */
export function SyncShippingButton({ configured }: { configured: boolean }) {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={!configured || pending}
        title={configured ? undefined : "Add SHOPIFY_ADMIN_ACCESS_TOKEN in Vercel to enable"}
        onClick={() => start(async () => setResult(await syncShopifyShippingAction()))}
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {pending ? "Syncing…" : "Sync shipping from Shopify"}
      </Button>
      {result ? (
        <p role="status" className={result.ok ? "text-xs text-emerald-700" : "text-xs text-red-600"}>
          {result.ok
            ? `Checked ${result.data.checked} orders: ${result.data.kitsShipped} kits shipped, ${result.data.kitsDelivered} delivered.${
                result.data.remaining ? ` ${result.data.remaining} orders left, run it again.` : ""
              }${result.data.errors.length ? ` ${result.data.errors.length} orders failed.` : ""}`
            : result.error}
        </p>
      ) : null}
    </div>
  );
}
