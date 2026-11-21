"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { normalizeKitCode, parseKitCode } from "@petwealth/domain";
import { Button, Input, cn } from "@petwealth/ui";
import { receiveKitAction, type ReceiveResult } from "./actions";

interface LogEntry {
  id: number;
  input: string;
  result: ReceiveResult;
}

/**
 * Scanner-first check-in. USB/Bluetooth scanners type the code and press
 * Enter; the field clears and re-focuses after every scan so staff can scan
 * a whole box without touching the mouse.
 */
export function Scanner() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => inputRef.current?.focus(), []);

  const submit = (raw: string) => {
    const code = normalizeKitCode(raw);
    if (!code) return;
    setValue("");
    const id = Date.now();
    if (!parseKitCode(code)) {
      setLog((l) => [{ id, input: code, result: { ok: false as const, error: `“${code}” isn't a valid kit ID (expected e.g. FFEC-002-946).` } }, ...l].slice(0, 20));
      inputRef.current?.focus();
      return;
    }
    start(async () => {
      const result = await receiveKitAction(code);
      setLog((l) => [{ id, input: code, result }, ...l].slice(0, 20));
      inputRef.current?.focus();
      if (result.ok) router.refresh();
    });
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="mx-auto flex max-w-xl flex-col gap-3"
      >
        <label htmlFor="kit-scan" className="text-center text-lg font-semibold text-ink">Scan kit barcode</label>
        <Input
          id="kit-scan"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Scan or type a kit ID, e.g. FFEC-002-946"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-14 text-center font-mono text-lg"
        />
        <Button type="submit" variant="brand" size="lg" disabled={pending || !value.trim()}>
          {pending ? "Receiving…" : "Receive kit"}
        </Button>
        <p className="text-center text-xs text-ink-subtle">The field stays focused for scanner input. Press Enter after typing.</p>
      </form>

      {log.length ? (
        <ul className="mx-auto mt-6 max-w-xl space-y-2" aria-live="polite">
          {log.map((e) => (
            <li
              key={e.id}
              className={cn(
                "flex gap-3 rounded-lg border p-3 text-sm",
                !e.result.ok ? "border-red-200 bg-red-50" : e.result.data.warnings.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50",
              )}
            >
              {!e.result.ok ? <XCircle className="size-5 shrink-0 text-red-600" /> : e.result.data.warnings.length ? <AlertTriangle className="size-5 shrink-0 text-amber-600" /> : <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />}
              <div>
                <p className="font-mono font-medium">{e.input}</p>
                {e.result.ok ? (
                  <>
                    <p>Received{e.result.data.petName ? ` — ${e.result.data.petName}` : ""}.</p>
                    {e.result.data.warnings.map((w) => <p key={w} className="text-amber-800">{w}</p>)}
                  </>
                ) : (
                  <p className="text-red-700">{e.result.error}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
