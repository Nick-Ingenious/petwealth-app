"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CloudUpload, FileSpreadsheet, X } from "lucide-react";
import { Button, cn } from "@petwealth/ui";
import { uploadLabFileAction } from "./actions";

/** Uploads go through one request, which our hosting caps at about 4.5 MB. Real WellResult exports are well under 1 MB. */
const MAX_BYTES = 4 * 1024 * 1024;

const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Drag the lab's WellResult CSV in (or click to browse), then upload it and open the review page. */
export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setError(`"${f.name}" isn't a CSV. Export the results from the PCR software as CSV and try again.`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`"${f.name}" is ${sizeLabel(f.size)}. The limit is 4 MB.`);
      return;
    }
    setFile(f);
  }

  function clear() {
    setFile(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  function submit() {
    if (!file) return;
    setError(null);
    start(async () => {
      const csv = await file.text();
      const res = await uploadLabFileAction(file.name, csv);
      if (res.ok) router.push(`/lab-results/${res.data.id}`);
      else setError(res.error);
    });
  }

  const browse = () => input.current?.click();

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={file ? `Selected ${file.name}. Choose a different file` : "Drop a CSV here or click to browse"}
        onClick={() => !pending && browse()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !pending) {
            e.preventDefault();
            browse();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!pending) pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100",
          dragging ? "border-brand-500 bg-brand-50" : "border-line bg-canvas hover:border-brand-300",
          pending && "cursor-wait opacity-70",
        )}
      >
        {file ? (
          <>
            <FileSpreadsheet className="size-10 text-brand-600" aria-hidden />
            <p className="text-base font-medium text-ink">{file.name}</p>
            <p className="text-sm text-ink-muted">
              {sizeLabel(file.size)} · {pending ? "Uploading and checking the file…" : "Ready to upload. Click to choose a different file."}
            </p>
          </>
        ) : (
          <>
            <CloudUpload className={cn("size-10", dragging ? "text-brand-600" : "text-ink-subtle")} aria-hidden />
            <p className="text-base text-ink">{dragging ? "Drop the CSV to add it" : "Drop CSV here or click to browse"}</p>
            <p className="text-sm text-ink-muted">CSV · Max 4 MB</p>
          </>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={!file || pending}>
          <CloudUpload className="size-4" aria-hidden />
          {pending ? "Uploading…" : "Upload file"}
        </Button>
        {file && !pending ? (
          <Button variant="ghost" onClick={clear}>
            <X className="size-4" aria-hidden /> Remove
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
