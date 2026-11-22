import type { ComponentProps, ReactNode } from "react";
import { cn } from "@petwealth/ui";

/** Large rounded inputs sized for thumbs, matching the existing app. */
export const fieldClass =
  "h-14 w-full rounded-2xl border border-zinc-200 bg-white px-5 text-base text-ink placeholder:text-zinc-400 focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-lilac-100";

export function TextField({ label, error, className, ...props }: ComponentProps<"input"> & { label: string; error?: string | undefined }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input aria-label={label} placeholder={`${label}${props.required ? "*" : ""}`} className={cn(fieldClass, error && "border-red-400", className)} {...props} />
      {error ? <span className="mt-1 block text-sm text-red-600">{error}</span> : null}
    </label>
  );
}

/** Two-up choice buttons (Dog/Cat, Male/Female, Yes/No). Uses radios so it works without JS. */
export function Choice({ name, options, defaultValue, legend, error, disabled }: { name: string; legend: ReactNode; options: { value: string; label: ReactNode }[]; defaultValue?: string | undefined; error?: string | undefined; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-lg text-ink">
        {legend} <span className="text-red-500">*</span>
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} defaultChecked={defaultValue === o.value} className="peer sr-only" />
            <span className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white text-base font-medium text-zinc-500 transition peer-checked:border-violet-300 peer-checked:bg-lilac-100 peer-checked:text-ink peer-focus-visible:ring-4 peer-focus-visible:ring-lilac-200 peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
    </fieldset>
  );
}

export function PrimaryButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn("flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-lg font-semibold text-white transition disabled:opacity-50", className)}
      {...props}
    />
  );
}

export function LilacButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn("flex h-14 w-full items-center justify-center gap-2 rounded-full bg-lilac-300 text-lg font-semibold text-ink transition disabled:opacity-50", className)}
      {...props}
    />
  );
}
