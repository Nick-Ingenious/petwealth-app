import Link from "next/link";
import { Microscope } from "lucide-react";
import { can, listLabBatches } from "@petwealth/api";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Lab Results" };

export default async function LabResultsPage() {
  const staff = await requireStaff("lab_results.view");
  const batches = await listLabBatches(staff);
  return (
    <>
      <PageHeader
        icon={<Microscope className="size-6" />}
        title="Lab Results"
        description="Upload the lab's results export, review each kit, then release results to customers."
      />
      {can(staff, "lab_results.upload") ? (
        <Card className="mb-6">
          <CardHeader
            title="Upload results"
            description="The WellResult CSV from the PCR software, as exported. Controls and mistyped codes are fine; they're flagged for review."
          />
          <CardBody>
            <UploadForm />
          </CardBody>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <CardHeader title="Uploads" description="Most recent first" />
        <div className="mt-4">
          {batches.length === 0 ? (
            <EmptyState title="No lab files uploaded yet" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Run</TH>
                  <TH>File</TH>
                  <TH>Uploaded</TH>
                  <TH className="text-right">To review</TH>
                  <TH className="text-right">Released</TH>
                  <TH className="text-right">Rerun</TH>
                  <TH>Checks</TH>
                </tr>
              </THead>
              <TBody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/lab-results/${b.id}`} className="font-mono text-brand-700 hover:underline">
                        #{b.number}
                      </Link>
                    </TD>
                    <TD className="max-w-64 truncate">{b.filename}</TD>
                    <TD className="whitespace-nowrap text-ink-muted">
                      {formatDateTime(b.createdAt)}
                      {b.uploadedBy ? ` · ${b.uploadedBy}` : ""}
                    </TD>
                    <TD className="text-right tabular-nums">{b.pending || ""}</TD>
                    <TD className="text-right tabular-nums">{b.released || ""}</TD>
                    <TD className="text-right tabular-nums">{b.rerun || ""}</TD>
                    <TD className="space-x-1 whitespace-nowrap">
                      {b.controlsFailed ? (
                        <Badge tone="danger">
                          {b.controlsFailed} control{b.controlsFailed > 1 ? "s" : ""} failed
                        </Badge>
                      ) : null}
                      {b.unmatched ? <Badge tone="warning">{b.unmatched} unmatched</Badge> : null}
                      {!b.pending && !b.unmatched ? <Badge tone="success">Done</Badge> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </Card>
    </>
  );
}
