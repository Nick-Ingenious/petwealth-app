"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@petwealth/ui";
import { uploadLabFileAction } from "./actions";

/** Pick the lab's WellResult CSV, send it as text, then open the review page. */
export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Lab results file"
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-canvas sm:w-auto"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError(null);
        }}
      />
      <Button onClick={submit} disabled={!file || pending}>
        <Upload className="size-4" />
        {pending ? "Reading file…" : "Upload"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
