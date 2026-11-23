"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MAX_KITS_PER_MAILER, SPECIES_LABEL, normalizeKitCode, parseKitCode, type Species } from "@petwealth/domain";
import { Button, Input, Select } from "@petwealth/ui";
import { registerKitsAction } from "./kit-actions";

interface Pet {
  id: string;
  name: string;
  species: Species;
}

/**
 * Staff version of the customer "Activate your kits" screen: scan tubes, pick
 * the pet for each, and everything registered together gets one return mailer.
 */
export function RegisterKits({ customerId, pets }: { customerId: string; pets: Pet[] }) {
  const [rows, setRows] = useState([{ kitCode: "", petId: "" }]);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!pets.length) return <p className="text-sm text-ink-muted">Add a pet for this customer before registering kits.</p>;

  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const submit = () =>
    start(async () => {
      const kits = rows.filter((r) => r.kitCode.trim()).map((r) => ({ kitCode: normalizeKitCode(r.kitCode), petId: r.petId }));
      const res = await registerKitsAction(customerId, kits);
      if (!res.ok) {
        const field = res.fieldErrors ? Object.values(res.fieldErrors).flat()[0] : undefined;
        setMessage({ ok: false, text: field ?? res.error });
        return;
      }
      const d = res.data;
      setRows([{ kitCode: "", petId: "" }]);
      setMessage(
        d.label.status === "label_created"
          ? { ok: true, text: `Registered ${d.kits.length} kit${d.kits.length > 1 ? "s" : ""}. Return mailer ${d.rmaNumber} is ready.` }
          : { ok: false, text: `Registered as ${d.rmaNumber}, but the FedEx code failed: ${d.label.error} Use “Retry label” below.` },
      );
    });

  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const parsed = row.kitCode ? parseKitCode(row.kitCode) : null;
        const choices = parsed ? pets.filter((p) => p.species === parsed.species) : pets;
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
            <div>
              <Input
                aria-label={`Kit ${i + 1} ID`}
                placeholder="Kit ID, e.g. FRES-001-937"
                value={row.kitCode}
                onChange={(e) => {
                  const p = parseKitCode(e.target.value);
                  const keep = p && pets.find((x) => x.id === row.petId)?.species === p.species;
                  const only = p ? pets.filter((x) => x.species === p.species) : [];
                  update(i, { kitCode: e.target.value, petId: keep ? row.petId : only.length === 1 ? only[0]!.id : "" });
                }}
                className="font-mono"
                autoComplete="off"
              />
              {row.kitCode && !parsed ? <p className="mt-1 text-xs text-red-600">Not a valid kit ID</p> : null}
              {parsed ? <p className="mt-1 text-xs text-ink-subtle">{SPECIES_LABEL[parsed.species].adjective} {parsed.panel} kit</p> : null}
            </div>
            <Select aria-label={`Pet for kit ${i + 1}`} value={row.petId} onChange={(e) => update(i, { petId: e.target.value })}>
              <option value="">Which pet?</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({SPECIES_LABEL[p.species].noun})
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="sm" className="mt-1" aria-label="Remove kit" disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={rows.length >= MAX_KITS_PER_MAILER} onClick={() => setRows((r) => [...r, { kitCode: "", petId: "" }])}>
          <Plus className="size-4" /> Add another kit
        </Button>
        <Button size="sm" disabled={pending || !rows.some((r) => r.kitCode && r.petId)} onClick={submit}>
          {pending ? "Registering…" : `Register ${rows.filter((r) => r.kitCode && r.petId).length || ""} kit${rows.length > 1 ? "s" : ""} & create FedEx code`}
        </Button>
      </div>
      <p className="text-xs text-ink-subtle">Kits registered together ship back in one mailer with one FedEx code (up to {MAX_KITS_PER_MAILER} tubes).</p>
      {message ? (
        <p role="status" className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
