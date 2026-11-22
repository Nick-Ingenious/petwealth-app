"use client";

import { useActionState, useEffect, useRef } from "react";
import { Info, RotateCcw, Truck } from "lucide-react";
import { Button, Field, Input, Select, buttonClasses, type ButtonVariant } from "@petwealth/ui";
import type { ActionResult } from "@/lib/action";
import { saveShippingAction } from "./actions";

export interface ReturnMailer {
  id: string;
  rmaNumber: string | null;
  trackingNumber: string | null;
  status: string;
}

const CARRIERS = [
  { value: "fedex", label: "FedEx" },
  { value: "ups", label: "UPS" },
  { value: "usps", label: "USPS" },
];

export function ShippingDialog({
  orderId,
  outbound,
  returns,
  trigger,
  triggerVariant = "brand",
}: {
  orderId: string;
  outbound: { carrier: string; trackingNumber: string | null } | null;
  returns: ReturnMailer[];
  trigger: string;
  triggerVariant?: ButtonVariant;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveShippingAction, null);

  useEffect(() => {
    if (state?.ok) {
      ref.current?.close();
      formRef.current?.reset();
    }
  }, [state]);

  const err = state && !state.ok ? state : null;

  return (
    <>
      <button type="button" className={buttonClasses(triggerVariant)} onClick={() => ref.current?.showModal()}>
        <Truck className="size-4" aria-hidden /> {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="shipping-dialog-title"
        className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl bg-surface p-0 text-left text-ink shadow-xl backdrop:bg-ink/40"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <form ref={formRef} action={action}>
          <input type="hidden" name="orderId" value={orderId} />
          <h2 id="shipping-dialog-title" className="border-b border-line px-6 py-5 text-xl font-semibold">
            Shipping information
          </h2>

          <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-6">
            <section className="space-y-4">
              <h3 className="flex items-center gap-2 font-semibold">
                <Truck className="size-5 text-brand-600" aria-hidden /> Outbound Shipment (Kit → Customer)
              </h3>
              <Field label="Carrier" htmlFor="ship-carrier" hint="Only FedEx shipments update kit status automatically.">
                <Select id="ship-carrier" name="carrier" defaultValue={outbound?.carrier ?? "fedex"}>
                  {CARRIERS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tracking number" htmlFor="ship-tracking" error={err?.fieldErrors?.trackingNumber?.[0]}>
                <Input
                  id="ship-tracking"
                  name="trackingNumber"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={outbound?.trackingNumber ?? ""}
                  placeholder="e.g. 794612345678"
                  className="font-mono"
                />
              </Field>
            </section>

            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold">
                <RotateCcw className="size-5 text-brand-600" aria-hidden /> Return Shipment (Sample → Lab)
              </h3>
              {returns.length ? (
                <ul className="space-y-2">
                  {returns.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-lg border border-line px-4 py-3 text-sm">
                      <span className="font-mono">{r.rmaNumber ?? "Return mailer"}{r.trackingNumber ? ` · FedEx ${r.trackingNumber}` : ""}</span>
                      <span className="text-ink-muted capitalize">{r.status.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="flex gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <Info className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
                {returns.length
                  ? "Return mailers are created and tracked automatically from the customer's kit registration."
                  : "Return tracking will be available once the customer registers their kits — the FedEx return code is created then."}
              </p>
            </section>

            <Field label="Notes" htmlFor="ship-note" hint="Notes will be added to the Activity Log." error={err?.fieldErrors?.note?.[0]}>
              <textarea
                id="ship-note"
                name="note"
                rows={3}
                maxLength={1000}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-xs placeholder:text-ink-subtle focus:border-brand-400 focus:ring-3 focus:ring-brand-100 focus:outline-none"
              />
            </Field>

            {err && !err.fieldErrors ? (
              <p role="alert" className="text-sm text-red-600">{err.error}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
            <Button variant="ghost" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save Shipping Info"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
