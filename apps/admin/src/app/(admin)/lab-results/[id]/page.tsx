import Link from "next/link";
import { notFound } from "next/navigation";
import { Microscope } from "lucide-react";
import { AppError, can, getLabBatch } from "@petwealth/api";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { AiReview } from "./ai-review";
import { AssignForm } from "./assign-form";
import { HeldRowsList } from "./held-rows";
import { ReviewTable } from "./review-table";

export const metadata = { title: "Lab run" };
// Writing an AI summary can take up to a minute.
export const maxDuration = 120;

export default async function LabBatchPage({ params }: PageProps<"/lab-results/[id]">) {
  const staff = await requireStaff("lab_results.view");
  const { id } = await params;
  const batch = await getLabBatch(staff, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const failedControls = batch.runControls.filter((c) => !c.passed);
  const canManage = can(staff, "lab_results.upload");
  const c = batch.cleanup;
  const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const cleaned = c
    ? [
        c.idsNormalized ? `${plural(c.idsNormalized, "kit ID")} tidied (spaces, capitals)` : null,
        c.plateControlRows ? `${plural(c.plateControlRows, "plate control row")} checked as run controls` : null,
        c.qualityCheckRows ? `${plural(c.qualityCheckRows, "quality-check row")} set aside` : null,
        c.offPanelRows ? `${plural(c.offPanelRows, "row")} for targets not on the panel left out` : null,
        c.heldRows ? `${plural(c.heldRows, "row")} with no kit ID held` : null,
      ].filter(Boolean)
    : [];
  const openHeld = batch.held.filter((h) => !h.dismissedAt);

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

      {cleaned.length ? (
        <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          <span className="font-medium text-ink">Cleaned before import:</span> {cleaned.join(" · ")}.
        </p>
      ) : null}

      <Card className="mb-6">
        <CardHeader title="AI review" description="Claude checks what the cleanup couldn't settle. It only suggests; nothing changes until you apply it." />
        <CardBody>
          <AiReview batchId={batch.id} review={batch.aiReview} unmatchedSamples={batch.unmatched.map((u) => u.sample)} canManage={canManage} />
        </CardBody>
      </Card>

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

      {batch.held.length ? (
        <Card className="mt-6">
          <CardHeader
            title="Rows with no kit ID"
            description={
              openHeld.length
                ? "These rows have no kit ID in the Sample column, so they weren't imported. We never guess which kit they belong to."
                : "All set aside."
            }
          />
          <CardBody>
            <HeldRowsList batchId={batch.id} held={batch.held} canManage={canManage} />
          </CardBody>
        </Card>
      ) : null}

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
