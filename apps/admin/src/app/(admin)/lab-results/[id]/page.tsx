import Link from "next/link";
import { notFound } from "next/navigation";
import { Microscope } from "lucide-react";
import { AppError, can, getLabBatch } from "@petwealth/api";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { AssignForm } from "./assign-form";
import { ReviewTable } from "./review-table";

export const metadata = { title: "Lab run" };

export default async function LabBatchPage({ params }: PageProps<"/lab-results/[id]">) {
  const staff = await requireStaff("lab_results.view");
  const { id } = await params;
  const batch = await getLabBatch(staff, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const failedControls = batch.runControls.filter((c) => !c.passed);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/lab-results" className="text-ink-muted hover:text-ink">
          ← Lab Results
        </Link>
      </p>
      <PageHeader
        icon={<Microscope className="size-6" />}
        title={`Run #${batch.number}`}
        description={`${batch.filename} · ${batch.rowCount} rows · uploaded ${formatDateTime(batch.createdAt)}${batch.uploadedBy ? ` by ${batch.uploadedBy}` : ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader
            title="Run controls"
            description={
              !batch.runControls.length
                ? "This file has no control rows."
                : failedControls.length
                  ? "Check these before releasing."
                  : "Positive and negative controls look right."
            }
          />
          <CardBody className="space-y-3 text-sm">
            {batch.runControls.length === 0 ? <p className="text-amber-700">No control rows in this file.</p> : null}
            {batch.runControls.map((c) => (
              <div key={`${c.kind}-${c.panelCode}`}>
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-mono">{c.panelCode}</span> {c.kind} control
                  </span>
                  <Badge tone={c.passed ? "success" : "danger"}>{c.passed ? "Passed" : "Check"}</Badge>
                </div>
                {c.issues.length ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
                    {c.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Unmatched samples"
            description={
              batch.unmatched.length
                ? "These samples didn't match a kit. Enter the right kit code to attach the results."
                : "Every sample matched a kit."
            }
          />
          {batch.unmatched.length ? (
            <CardBody className="divide-y divide-line">
              {batch.unmatched.map((u) => (
                <div key={u.sample} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                  <div className="text-sm">
                    <p>
                      <span className="font-mono">{u.sample}</span>
                      {u.panelCode ? <span className="ml-2 text-ink-muted">{u.panelCode}</span> : null}
                    </p>
                    <p className="text-amber-700">{u.reason}</p>
                    <p className="text-ink-muted">Detected: {u.detected.length ? u.detected.join(", ") : "nothing"}</p>
                  </div>
                  {can(staff, "lab_results.upload") ? (
                    <AssignForm batchId={batch.id} sample={u.sample} suggestion={u.suggestedCode ?? ""} />
                  ) : null}
                </div>
              ))}
            </CardBody>
          ) : null}
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          title="Results by kit"
          description="Detected means Cq 34 or lower. Releasing moves the kit to Completed and emails the customer."
        />
        <ReviewTable batchId={batch.id} results={batch.results} canRelease={can(staff, "lab_results.release")} />
      </Card>
    </>
  );
}
