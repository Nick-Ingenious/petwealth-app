"use client";

import { useActionState } from "react";
import { KIT_STATUS_META, type KitStatus } from "@petwealth/domain";
import { Button, Input, Select } from "@petwealth/ui";
import type { ActionResult } from "@/lib/action";
import { changeKitStatusAction } from "./actions";

export function StatusForm({ kitCode, next }: { kitCode: string; next: readonly KitStatus[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(changeKitStatusAction, null);
  if (!next.length) return <p className="text-sm text-ink-muted">This kit is in a final state.</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kitCode" value={kitCode} />
      <Select name="to" aria-label="New status" required defaultValue="">
        <option value="" disabled>Move to…</option>
        {next.map((s) => (
          <option key={s} value={s}>{KIT_STATUS_META[s].label}</option>
        ))}
      </Select>
      <Input name="note" placeholder="Reason (optional, saved to the audit log)" maxLength={500} />
      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Update status"}
      </Button>
      {state ? (
        <p role="status" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}
    </form>
  );
}
