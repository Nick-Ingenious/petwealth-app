import Link from "next/link";
import { Truck } from "lucide-react";
import { can, listReturnShipments } from "@petwealth/api";
import { Badge, Card, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { FilterSelect, SearchBox } from "@/components/list-controls";
import { Pagination } from "@/components/pagination";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/format";
import { ReturnRowActions } from "./row-actions";

export const metadata = { title: "FedEx Returns" };

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Creating", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  label_created: { label: "Created", tone: "neutral" },
  in_transit: { label: "In Transit", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  exception: { label: "Exception", tone: "warning" },
  voided: { label: "Voided", tone: "neutral" },
};

const SHOW_KITS = 3;

export default async function ReturnsPage({ searchParams }: PageProps<"/returns">) {
  const staff = await requireStaff("kits.view");
  const sp = await searchParams;
  const page = await listReturnShipments(staff, sp);
  const canManage = can(staff, "kits.manage");

  return (
    <>
      <PageHeader
        icon={<Truck className="size-6" />}
        title="FedEx Returns"
        description="Every return mailer: its RMA, the kits inside, FedEx tracking and status. Retry failed codes and refresh tracking."
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBox placeholder="Search by RMA, tracking number, kit ID or customer…" />
        <FilterSelect name="status" label="All statuses" options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
      </div>
      <Card className="overflow-hidden">
        {page.items.length === 0 ? (
          <EmptyState icon={<Truck className="size-8" />} title="No return mailers match" description="Try a different search or clear the status filter." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <tr>
                  <TH>RMA</TH>
                  <TH>Kits</TH>
                  <TH>Customer</TH>
                  <TH>Tracking</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Failed</TH>
                  <TH>Last error</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {page.items.map((r) => {
                  const st = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
                  const extra = r.kitCodes.length - SHOW_KITS;
                  return (
                    <TR key={r.id} className="align-top">
                      <TD>
                        <p className="font-mono font-medium">{r.rmaNumber ?? "Not assigned"}</p>
                        <p className="text-xs text-ink-muted">Mailer {r.number}</p>
                        {r.labelFormat && !["pending", "failed"].includes(r.status) ? (
                          <a href={`/api/v1/shipments/${r.id}/label`} target="_blank" rel="noreferrer" className="text-xs text-brand-700 hover:underline">
                            {r.labelFormat === "qr_png" ? "View QR code" : "View label"}
                          </a>
                        ) : null}
                      </TD>
                      <TD>
                        <div className="flex min-w-32 max-w-60 flex-wrap gap-1">
                          {r.kitCodes.slice(0, SHOW_KITS).map((c) => (
                            <Link key={c} href={`/kits/${c}`} className="whitespace-nowrap rounded-full bg-canvas px-2 py-0.5 font-mono text-xs text-ink hover:bg-brand-50">
                              {c}
                            </Link>
                          ))}
                          {extra > 0 ? (
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700" title={r.kitCodes.slice(SHOW_KITS).join(", ")}>
                              +{extra} more
                            </span>
                          ) : null}
                        </div>
                      </TD>
                      <TD>
                        {r.customerId ? (
                          <Link href={`/customers/${r.customerId}`} className="text-brand-700 hover:underline">
                            {r.customerName ?? r.customerEmail}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">Unknown</span>
                        )}
                      </TD>
                      <TD>
                        {r.trackingNumber ? (
                          <a
                            href={r.trackingUrl ?? `https://www.fedex.com/fedextrack/?trknbr=${r.trackingNumber}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-brand-700 hover:underline"
                          >
                            {r.trackingNumber}
                          </a>
                        ) : (
                          <span className="text-ink-muted">None yet</span>
                        )}
                        {r.statusDetail ? <p className="max-w-48 text-xs text-ink-muted">{r.statusDetail}</p> : null}
                      </TD>
                      <TD>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-ink-muted">
                        <p>{formatDate(r.createdAt)}</p>
                        <p className="text-xs">{formatTime(r.createdAt)}</p>
                      </TD>
                      <TD className="text-right tabular-nums">{r.failedAttempts}</TD>
                      <TD className="max-w-48 text-xs text-red-600">
                        {(r.status === "failed" || r.status === "exception") && r.error ? (
                          <p className="line-clamp-2 break-words" title={r.error}>
                            {r.error}
                          </p>
                        ) : null}
                      </TD>
                      <TD className="text-right">
                        <ReturnRowActions id={r.id} status={r.status} hasTracking={Boolean(r.trackingNumber)} canManage={canManage} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
      <Pagination {...page} noun="return mailers" basePath="/returns" searchParams={sp} />
    </>
  );
}
