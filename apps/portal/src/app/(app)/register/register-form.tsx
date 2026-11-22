"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ArrowRight, Check, Lightbulb, Loader2, Plus, ScanLine, Trash2 } from "lucide-react";
import { MAX_KITS_PER_MAILER, PANEL_LABEL, SPECIES_LABEL, normalizeKitCode, type Panel, type Species } from "@petwealth/domain";
import { cn } from "@petwealth/ui";
import { PrimaryButton } from "@/components/fields";
import { checkKitAction, registerKitsAction } from "./actions";
import { Scanner, canScanInApp, kitIdFromQr } from "./scanner";

interface Pet {
  id: string;
  name: string;
  species: Species;
  breed: string | null;
  sex: string | null;
  weightLbs: number | null;
}
interface Row {
  code: string;
  state: "empty" | "checking" | "ok" | "error";
  species?: Species;
  panel?: Panel;
  message?: string;
  petId: string;
}

const emptyRow = (): Row => ({ code: "", state: "empty", petId: "" });

export function RegisterForm({ pets, initialCodes, newPetId }: { pets: Pet[]; initialCodes: string[]; newPetId: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialCodes.length ? initialCodes.map((code) => ({ ...emptyRow(), code })) : [emptyRow()]);
  const [scanFor, setScanFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [scannable, setScannable] = useState(false);
  useEffect(() => setScannable(canScanInApp()), []);

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const check = useCallback(async (i: number, raw: string) => {
    const code = normalizeKitCode(raw);
    if (!code) return update(i, { state: "empty" });
    update(i, { code, state: "checking" });
    const res = await checkKitAction(code);
    if (!res.ok) return update(i, { state: "error", message: res.error });
    if (!res.data.ok) return update(i, { state: "error", message: res.data.message });
    const d = res.data; // narrowed: a valid, available kit code
    setRows((all) => {
      if (all.some((r, j) => j !== i && r.code === d.code && r.state === "ok")) {
        return all.map((r, j) => (j === i ? { ...r, state: "error", message: "You've already added this kit." } : r));
      }
      return all.map((r, j) => {
        if (j !== i) return r;
        const matching = pets.filter((p) => p.species === d.species);
        const keep = pets.find((p) => p.id === r.petId)?.species === d.species;
        // A pet just added from this screen wins; otherwise auto-pick when there's only one match.
        const fresh = newPetId && matching.find((p) => p.id === newPetId);
        return { ...r, code: d.code, state: "ok" as const, species: d.species, panel: d.panel, message: undefined, petId: keep ? r.petId : fresh ? fresh.id : matching.length === 1 ? matching[0]!.id : "" };
      });
    });
  }, [pets, newPetId]);

  // Validate codes that arrived via the QR link (?kit=…) or after adding a pet.
  useEffect(() => {
    rows.forEach((r, i) => r.code && r.state === "empty" && check(i, r.code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = rows.filter((r) => r.state === "ok" && r.petId);
  const blocked = rows.some((r) => r.code && (r.state !== "ok" || !r.petId));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await registerKitsAction(ready.map((r) => ({ kitCode: r.code, petId: r.petId })));
      if (!res.ok) return setError(res.error);
      router.push(`/kits/${res.data.firstCode}?registered=1` as never);
    });

  const addPetHref = (species?: Species) => {
    const kits = rows.map((r) => r.code).filter(Boolean).join(",");
    const back = `/register${kits ? `?kits=${encodeURIComponent(kits)}` : ""}`;
    return `/pets/new?${species ? `species=${species}&` : ""}returnTo=${encodeURIComponent(back)}`;
  };

  return (
    <div className="space-y-5">
      {rows.map((row, i) => {
        const choices = row.species ? pets.filter((p) => p.species === row.species) : [];
        return (
          <section key={i} className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Kit #{i + 1}</h2>
              {rows.length > 1 ? (
                <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label={`Remove kit ${i + 1}`} className="p-2 text-zinc-400">
                  <Trash2 className="size-5" />
                </button>
              ) : null}
            </div>
            <label className="relative block">
              <span className="absolute -top-2.5 left-4 bg-white px-1 text-sm text-zinc-500">
                Test Kit ID<span className="text-red-500">*</span>
              </span>
              <input
                value={row.code}
                onChange={(e) => update(i, { code: e.target.value.toUpperCase(), state: "empty", message: undefined })}
                onBlur={(e) => check(i, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), check(i, (e.target as HTMLInputElement).value))}
                placeholder="e.g. FRES-001-937"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={row.state === "error"}
                className={cn("h-16 w-full rounded-2xl border bg-white pl-5 pr-24 font-mono text-xl tracking-wide focus:outline-none focus:ring-4 focus:ring-lilac-100", row.state === "error" ? "border-red-400" : "border-zinc-200")}
              />
              <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {scannable ? (
                  <button type="button" onClick={() => setScanFor(i)} className="rounded-full p-2 text-zinc-500" aria-label="Scan QR code">
                    <ScanLine className="size-6" />
                  </button>
                ) : null}
                {row.state === "checking" ? <Loader2 className="size-6 animate-spin text-zinc-400" /> : null}
                {row.state === "ok" ? (
                  <span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-500"><Check className="size-5" /></span>
                ) : null}
              </span>
            </label>
            {row.state === "error" ? <p role="alert" className="mt-2 text-sm text-red-600">{row.message}</p> : null}
            {row.state === "ok" && row.species && row.panel ? (
              <p className="mt-2 text-sm text-zinc-500">{SPECIES_LABEL[row.species].adjective} {PANEL_LABEL[row.panel]} Health Test</p>
            ) : null}

            {row.state === "ok" ? (
              <div className="mt-5">
                <h3 className="mb-3 text-xl">Who is this kit for?</h3>
                <div className="space-y-2">
                  {choices.map((p) => (
                    <label key={p.id} className={cn("flex cursor-pointer items-center gap-4 rounded-3xl border-2 p-4", row.petId === p.id ? "border-indigo-500 bg-indigo-50/60" : "border-zinc-100")}>
                      <input type="radio" name={`pet-${i}`} className="sr-only" checked={row.petId === p.id} onChange={() => update(i, { petId: p.id })} />
                      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-lilac-100 text-2xl" aria-hidden>{p.species === "dog" ? "🐶" : "🐱"}</span>
                      <span>
                        <span className="block text-xl font-semibold">{p.name}</span>
                        <span className="text-zinc-500">{[p.breed, p.sex && p.sex[0]!.toUpperCase() + p.sex.slice(1), p.weightLbs && `${p.weightLbs} lbs`].filter(Boolean).join(" · ")}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <Link href={addPetHref(row.species) as never} className={cn("mt-3 flex h-14 items-center justify-center gap-2 rounded-full text-lg font-semibold", choices.length ? "border border-zinc-200 bg-white" : "bg-lilac-300")}>
                  <Plus className="size-5" /> {choices.length ? "Add another pet" : "Add Pet to Kit"}
                </Link>
              </div>
            ) : null}
          </section>
        );
      })}

      <section>
        <h2 className="mb-3 text-3xl font-semibold">Have another test kit?</h2>
        <button
          type="button"
          disabled={rows.length >= MAX_KITS_PER_MAILER}
          onClick={() => setRows((r) => [...r, emptyRow()])}
          className="flex h-14 w-full items-center justify-center rounded-full border border-zinc-200 bg-white text-lg font-semibold disabled:opacity-50"
        >
          Enter Kit ID
        </button>
      </section>

      <div className="flex gap-3 rounded-3xl bg-sun-50 p-5 text-lg text-zinc-700">
        <Lightbulb className="mt-1 size-6 shrink-0 text-amber-500" aria-hidden />
        <p>Kits you register together ship in one mailer with one FedEx code. Up to {MAX_KITS_PER_MAILER} tubes.</p>
      </div>

      {error ? <p role="alert" className="text-center text-red-600">{error}</p> : null}
      <PrimaryButton type="button" disabled={pending || !ready.length || blocked} onClick={submit}>
        {pending ? "Registering…" : `Register ${ready.length || ""} kit${ready.length === 1 ? "" : "s"}`} <ArrowRight className="size-5" aria-hidden />
      </PrimaryButton>
      <p className="text-center text-zinc-500">You&apos;ll get your FedEx shipping code on the next screen and by email.</p>

      {scanFor !== null ? (
        <Scanner
          onClose={() => setScanFor(null)}
          onResult={(value) => {
            const i = scanFor;
            setScanFor(null);
            check(i, kitIdFromQr(value));
          }}
        />
      ) : null}
    </div>
  );
}
