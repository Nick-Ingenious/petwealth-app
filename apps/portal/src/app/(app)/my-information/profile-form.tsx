"use client";

import { startTransition, useActionState } from "react";
import { LilacButton, TextField, fieldClass } from "@/components/fields";
import type { ActionResult } from "@/lib/action";
import { updateProfileAction } from "./actions";

export interface ProfileInitial {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  smsOptIn: boolean;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
}

export function ProfileForm({ initial }: { initial: ProfileInitial }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateProfileAction,
    null,
  );
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  const addrErr =
    state && !state.ok && state.fieldErrors?.address
      ? "Check your address: use a 2-letter state and a 5-digit ZIP."
      : undefined;

  return (
    <form
      className="space-y-5"
      // Submit by hand so React doesn't clear the form when the server sends back an error.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField
          showLabel
          name="firstName"
          label="First Name"
          required
          defaultValue={initial.firstName}
          autoComplete="given-name"
          maxLength={80}
          error={err("firstName")}
        />
        <TextField
          showLabel
          name="lastName"
          label="Last Name"
          required
          defaultValue={initial.lastName}
          autoComplete="family-name"
          maxLength={80}
          error={err("lastName")}
        />
      </div>
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-500">Email Address</span>
        <input
          value={initial.email}
          readOnly
          aria-readonly
          className={`${fieldClass} cursor-not-allowed bg-[#F1F5F9] text-zinc-500`}
        />
        <span className="mt-1 block text-sm text-zinc-500">
          This is the email you sign in with.
        </span>
      </label>
      <TextField
        showLabel
        name="phone"
        label="Phone Number"
        type="tel"
        required
        defaultValue={initial.phone}
        autoComplete="tel"
        inputMode="tel"
        error={err("phone")}
      />

      <fieldset className="space-y-3">
        <legend className="mb-2 text-lg font-semibold text-ink">Shipping Address</legend>
        <TextField
          showLabel
          name="line1"
          label="Street Address"
          required
          defaultValue={initial.line1}
          autoComplete="address-line1"
          maxLength={120}
        />
        <TextField
          showLabel
          name="line2"
          label="Apt, suite (optional)"
          defaultValue={initial.line2}
          autoComplete="address-line2"
          maxLength={120}
        />
        <TextField
          showLabel
          name="city"
          label="City"
          required
          defaultValue={initial.city}
          autoComplete="address-level2"
          maxLength={80}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            showLabel
            name="region"
            label="State"
            required
            defaultValue={initial.region}
            autoComplete="address-level1"
            maxLength={2}
            className="uppercase"
          />
          <TextField
            showLabel
            name="postalCode"
            label="ZIP"
            required
            defaultValue={initial.postalCode}
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={10}
          />
        </div>
        {addrErr ? <p className="text-sm text-red-600">{addrErr}</p> : null}
        <p className="text-sm text-zinc-500">
          We use this for your FedEx return codes. Past orders keep the address they shipped to.
        </p>
      </fieldset>

      <label className="flex items-start gap-3 rounded-2xl bg-white p-4">
        <input
          type="checkbox"
          name="smsOptIn"
          defaultChecked={initial.smsOptIn}
          className="mt-0.5 size-5 accent-violet-600"
        />
        <span className="text-base text-zinc-700">
          Text me when my kit ships, arrives at the lab, and when results are ready. Message &amp;
          data rates may apply. Reply STOP to opt out.
        </span>
      </label>

      {state && !state.ok && !state.fieldErrors ? (
        <p
          role="alert"
          className="rounded-xl border border-[#F0C7C7] bg-[#F5DFDF] px-4 py-3 text-sm text-[#9C3535]"
        >
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-center text-sm font-medium text-emerald-700">
          {state.message}
        </p>
      ) : null}
      <LilacButton type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </LilacButton>
    </form>
  );
}
