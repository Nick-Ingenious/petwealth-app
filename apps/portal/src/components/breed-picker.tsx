"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { BREEDS, searchBreeds, type Species } from "@petwealth/domain";
import { cn } from "@petwealth/ui";

/**
 * Breed field, as in the old app: a select-style row that opens a "Select
 * breed" sheet with a search box and the list (chosen breed: lilac with a ✓).
 * List only, no free text. Submits as `name` through a hidden input.
 */
export function BreedPicker({
  name,
  species,
  value,
  onChange,
  showLabel,
  error,
}: {
  name: string;
  species: Species | "";
  value: string;
  onChange: (breed: string) => void;
  showLabel?: boolean;
  error?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const breeds = useMemo(() => (species ? BREEDS[species] : []), [species]);
  const results = useMemo(() => searchBreeds(breeds, query), [breeds, query]);

  // Start with an empty search each time the sheet closes.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => setQuery("");
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  function open() {
    if (!species) return;
    setQuery("");
    dialog.current?.showModal();
    requestAnimationFrame(() => {
      dialog.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
      search.current?.focus();
    });
  }

  function choose(breed: string) {
    onChange(breed);
    dialog.current?.close();
  }

  return (
    <div>
      {showLabel ? <span className="mb-1 block text-sm text-zinc-500">Breed</span> : null}
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={open}
        disabled={!species}
        aria-haspopup="dialog"
        aria-label={value ? `Breed: ${value}. Change breed` : "Select breed"}
        className={cn(
          "flex h-14 w-full items-center justify-between gap-3 rounded-2xl border bg-white px-5 text-left text-base transition focus:outline-none focus-visible:ring-4 focus-visible:ring-lilac-100 disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-red-400" : "border-zinc-200",
        )}
      >
        <span className={cn("truncate", value ? "text-ink" : "text-zinc-400")}>{value || (species ? "Select breed*" : "Choose species first")}</span>
        <ChevronDown className="size-5 shrink-0 text-zinc-500" aria-hidden />
      </button>
      {error ? <span className="mt-1 block text-sm text-red-600">{error}</span> : null}

      <dialog
        ref={dialog}
        aria-labelledby="breed-sheet-title"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-0 mt-auto h-[85dvh] max-h-[85dvh] w-full max-w-none rounded-t-3xl bg-white p-0 text-ink shadow-xl backdrop:bg-black/40 sm:mx-auto sm:mb-auto sm:h-[70dvh] sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 id="breed-sheet-title" className="text-xl font-semibold">
              Select breed
            </h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close" className="rounded-full p-2 hover:bg-zinc-100">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="px-5 pb-3">
            <label className="relative block">
              <span className="sr-only">{species === "cat" ? "Search cat breeds" : "Search dog breeds"}</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                ref={search}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter picks the top match instead of submitting the pet form.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (results[0]) choose(results[0]);
                  }
                }}
                placeholder={species === "cat" ? "Search cat breeds" : "Search dog breeds"}
                autoComplete="off"
                className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pl-12 pr-4 text-base placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-lilac-100"
              />
            </label>
          </div>
          <ul role="listbox" aria-label="Breeds" className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {results.map((b) => {
              const selected = b === value;
              return (
                <li key={b} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => choose(b)}
                    className={cn(
                      "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-base",
                      selected ? "bg-[#F2ECFF] font-semibold" : "hover:bg-zinc-50",
                    )}
                  >
                    <span>{b}</span>
                    {selected ? <Check className="size-5 shrink-0 text-[#5B3FA8]" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
            {results.length === 0 ? <li className="px-3 py-6 text-center text-zinc-500">No matching breeds</li> : null}
          </ul>
        </div>
      </dialog>
    </div>
  );
}
