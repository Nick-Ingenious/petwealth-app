"use client";

import { useState, useTransition } from "react";
import type { StoredHeldRows } from "@petwealth/domain";
import { Button } from "@petwealth/ui";
import { formatDateTime } from "@/lib/format";
import { dismissHeldAction } from "../actions";

const KIT_TYPE: Record<string, string> = {
  CFEC: "dog fecal",
  FFEC: "cat fecal",
  CRES: "dog respiratory",
  FRES: "cat respiratory",
};

/** Rows that had no kit ID: what the panel suggests, and a button to set them aside. */
export function HeldRowsList({ batchId, held, canManage }: { batchId: string; held: StoredHeldRows[]; canManage: boolean }) {
  return (
    <div className="divide-y divide-line">
      {held.map((h) => (
        <HeldGroup key={h.panelCode} batchId={batchId} h={h} canManage={canManage} />
      ))}
    </div>
  );
}

function HeldGroup({ batchId, h, canManage }: { batchId: string; h: StoredHeldRows; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const looksLike = h.kitPrefix
    ? `Looks like a ${h.kitPrefix} kit (${KIT_TYPE[h.kitPrefix] ?? h.kitPrefix}).`
    : h.panelCode === "VDP"
      ? "Oral panel (cat or dog)."
      : h.panelCode
        ? `Panel ${h.panelCode} isn't a Petwealth test yet.`
        : "No panel code on these rows.";
  return (
    <div className={`flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between ${h.dismissedAt ? "opacity-60" : ""}`}>
      <div className="text-sm">
        <p>
          <span className="font-mono">{h.panelCode || "No panel"}</span>
          <span className="ml-2 text-ink-muted">
            {h.rowCount} row{h.rowCount === 1 ? "" : "s"} · wells {h.wells.join(", ")}
          </span>
        </p>
        <p className="text-amber-700">{looksLike} A person needs to decide which kit these belong to.</p>
        <p className="text-ink-muted">Detected: {h.detected.length ? h.detected.join(", ") : "nothing"}</p>
        {h.dismissedAt ? (
          <p className="text-xs text-ink-muted">
            Set aside by {h.dismissedBy} · {formatDateTime(h.dismissedAt)}
          </p>
        ) : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
      {canManage && !h.dismissedAt ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            confirm(`Set aside these ${h.rowCount} rows? They stay on this upload for the record. To import them, add the kit ID to the Sample column and upload again.`) &&
            start(async () => {
              const r = await dismissHeldAction(batchId, h.panelCode);
              if (!r.ok) setError(r.error);
            })
          }
        >
          {pending ? "Setting aside…" : "Set aside"}
        </Button>
      ) : null}
    </div>
  );
}
