"use client";

import { useActionState, useState, useTransition } from "react";
import { ROLE_KEYS, ROLE_LABEL, type RoleKey } from "@petwealth/domain";
import { Button, Field, Input, Select } from "@petwealth/ui";
import type { ActionResult } from "@/lib/action";
import { inviteStaffAction, updateStaffAction } from "./actions";

export function InviteForm({ assignableRoles }: { assignableRoles: RoleKey[] }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(inviteStaffAction, null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form action={action} className="grid items-end gap-3 md:grid-cols-[1fr_1fr_12rem_auto]">
      <Field label="Work email" htmlFor="invite-email" error={err("email")}>
        <Input id="invite-email" name="email" type="email" placeholder="name@petwealth.com" required />
      </Field>
      <Field label="Name (optional)" htmlFor="invite-name">
        <Input id="invite-name" name="name" />
      </Field>
      <Field label="Role" htmlFor="invite-role" error={err("role")}>
        <Select id="invite-role" name="role" defaultValue="customer_support">
          {assignableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Inviting…" : "Invite"}</Button>
      {state ? <p role="status" className={`md:col-span-4 text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`}>{state.ok ? state.message : state.error}</p> : null}
    </form>
  );
}

export function UserRowControls({ id, role, status, assignableRoles }: { id: string; role: RoleKey; status: string; assignableRoles: RoleKey[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (patch: Parameters<typeof updateStaffAction>[1]) =>
    start(async () => {
      const r = await updateStaffAction(id, patch);
      setError(r.ok ? null : r.error);
    });
  const roles = assignableRoles.includes(role) ? assignableRoles : [role, ...assignableRoles];
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select aria-label="Role" value={role} disabled={pending} onChange={(e) => run({ role: e.target.value })} className="h-8 w-auto text-xs">
        {ROLE_KEYS.filter((r) => roles.includes(r)).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </Select>
      {status === "disabled" ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run({ status: "active" })}>Enable</Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Disable this user? They lose access immediately.") && run({ status: "disabled" })}>Disable</Button>
      )}
      {error ? <p className="w-full text-right text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
