"use client";

import Image from "next/image";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { Choice, PrimaryButton, TextField } from "@/components/fields";
import type { ActionResult } from "@/lib/action";
import { onboardingAction } from "./actions";

interface Props {
  initial: { firstName: string; lastName: string; phone: string; customerType: string; smsOptIn: boolean };
  needsAddress: boolean;
  next: string;
}

export function OnboardingForm({ initial, needsAddress, next }: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(onboardingAction, null);
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);
  const addrErr = state && !state.ok && state.fieldErrors?.address ? "Check your address: use a 2-letter state and 5-digit ZIP." : undefined;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <TextField name="firstName" label="Pet Parent First Name" required autoComplete="given-name" defaultValue={initial.firstName} error={err("firstName")} />
      <TextField name="lastName" label="Pet Parent Last Name" required autoComplete="family-name" defaultValue={initial.lastName} error={err("lastName")} />
      <TextField name="phone" label="Phone Number" required type="tel" autoComplete="tel" defaultValue={initial.phone} error={err("phone")} />

      {needsAddress ? (
        <fieldset className="space-y-3 pt-2">
          <legend className="mb-2 text-lg">Shipping address <span className="text-red-500">*</span></legend>
          <TextField name="line1" label="Street address" required autoComplete="address-line1" />
          <TextField name="line2" label="Apt, suite (optional)" autoComplete="address-line2" />
          <div className="grid grid-cols-[1fr_5rem_7rem] gap-2">
            <TextField name="city" label="City" required autoComplete="address-level2" />
            <TextField name="region" label="ST" required maxLength={2} autoComplete="address-level1" className="uppercase" />
            <TextField name="postalCode" label="ZIP" required inputMode="numeric" autoComplete="postal-code" />
          </div>
          {addrErr ? <p className="text-sm text-red-600">{addrErr}</p> : null}
          <p className="text-sm text-zinc-500">Used for your FedEx return code so samples get back to our lab.</p>
        </fieldset>
      ) : null}

      <div className="pt-2">
        <Choice
          name="customerType"
          legend="I am a"
          defaultValue={initial.customerType || undefined}
          error={err("customerType")}
          options={[
            {
              value: "pet_parent",
              label: "Pet Parent",
              image: <Image src="/onboarding/pet-parent.webp" alt="" width={400} height={319} className="h-20 w-auto" />,
            },
            {
              value: "pet_professional",
              label: "Pet Professional",
              image: <Image src="/onboarding/pet-professional.webp" alt="" width={300} height={393} className="h-20 w-auto" />,
            },
          ]}
        />
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-zinc-600">
        <input type="checkbox" name="smsOptIn" defaultChecked={initial.smsOptIn} className="mt-0.5 size-5 accent-violet-600" />
        <span>Text me a reminder to mail my sample, and when it&apos;s on the way to the lab, arrives, and when results are ready. Message frequency varies. Message &amp; data rates may apply. Reply STOP to opt out, HELP for help.</span>
      </label>

      {state && !state.ok && !state.fieldErrors ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
      <PrimaryButton type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"} <ArrowRight className="size-5" aria-hidden />
      </PrimaryButton>
    </form>
  );
}
