"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@petwealth/ui";
import type { ActionResult } from "@/lib/action";
import { updateCustomerAction } from "./actions";

interface Props {
  id: string;
  initial: { firstName: string; lastName: string; email: string; phone: string; smsOptIn: boolean };
  canEdit: boolean;
}

export function CustomerForm({ id, initial, canEdit }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateCustomerAction.bind(null, id), null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={!canEdit || pending} className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={err("firstName")}>
          <Input id="firstName" name="firstName" defaultValue={initial.firstName} autoComplete="off" required />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={err("lastName")}>
          <Input id="lastName" name="lastName" defaultValue={initial.lastName} autoComplete="off" required />
        </Field>
        <Field label="Email" htmlFor="email" error={err("email")} hint="Changing this does not change their sign-in email yet.">
          <Input id="email" name="email" type="email" defaultValue={initial.email} required />
        </Field>
        <Field label="Mobile phone" htmlFor="phone" error={err("phone")}>
          <Input id="phone" name="phone" type="tel" defaultValue={initial.phone} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="smsOptIn" defaultChecked={initial.smsOptIn} className="size-4 accent-brand-600" />
          Customer agreed to receive SMS kit and result updates
        </label>
      </fieldset>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          {state ? <p role="status" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{state.ok ? state.message : state.error}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">You have read-only access to customers.</p>
      )}
    </form>
  );
}
