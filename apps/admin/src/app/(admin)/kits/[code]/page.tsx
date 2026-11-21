import Link from "next/link";
import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { AppError, can, getKit } from "@petwealth/api";
import { allowedNextStatuses, parseKitCode } from "@petwealth/domain";
import { Badge, Card, CardBody, CardHeader, DefinitionList, KitStatusBadge, PageHeader } from "@petwealth/ui";
import { Timeline } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, fullName, kitName, orderRef } from "@/lib/format";
import { StatusForm } from "./status-form";

const HEALTH = { clean: ["success", "Clean"], needs_attention: ["warning", "Needs attention"], critical: ["danger", "Critical"] } as const;

export default async function KitDetail({ params }: PageProps<"/kits/[code]">) {
  const staff = await requireStaff("kits.view");
  const parsed = parseKitCode(decodeURIComponent((await params).code));
  if (!parsed) notFound();
  const kit = await getKit(staff, parsed.code).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  // Receiving is done from the scanner page; everything else needs kits.manage.
  const next = can(staff, "kits.manage") ? allowedNextStatuses(kit.status) : [];

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/kits" className="text-ink-muted hover:text-ink">← Tests</Link></p>
      <PageHeader icon={<FlaskConical className="size-6" />} title={<span className="font-mono">{kit.code}</span>} description={kitName(kit)} actions={<KitStatusBadge status={kit.status} />} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DefinitionList
                items={[
                  { label: "Customer", value: kit.customer ? <Link className="text-brand-700 hover:underline" href={`/customers/${kit.customer.id}`}>{fullName(kit.customer)}</Link> : null },
                  { label: "Pet", value: kit.pet ? <Link className="text-brand-700 hover:underline" href={`/pets/${kit.pet.id}`}>{kit.pet.name}</Link> : <span className="text-amber-700">Not registered yet</span> },
                  { label: "Order", value: kit.order ? <Link className="text-brand-700 hover:underline" href={`/orders/${kit.order.id}`}>{orderRef(kit.order.number)}</Link> : null },
                  { label: "Shipped", value: formatDateTime(kit.shippedAt) },
                  { label: "Activated", value: formatDateTime(kit.activatedAt) },
                  { label: "Received at lab", value: formatDateTime(kit.receivedAt) },
                  { label: "Completed", value: formatDateTime(kit.completedAt) },
                  { label: "Last update", value: formatDateTime(kit.statusChangedAt) },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" description="Every status change, who made it, and when." />
            <CardBody><Timeline events={kit.timeline} /></CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {next.length ? (
            <Card>
              <CardHeader title="Change status" description="Only valid next steps are offered." />
              <CardBody><StatusForm kitCode={kit.code!} next={next} /></CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Shipping" />
            <CardBody className="space-y-3 text-sm">
              {kit.shipments.length === 0 ? <p className="text-ink-muted">No labels yet.</p> : null}
              {kit.shipments.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium capitalize">{s.direction}</p>
                    <p className="font-mono text-xs text-ink-muted">FedEx {s.trackingNumber}</p>
                  </div>
                  <Badge tone={s.status === "delivered" ? "success" : s.status === "exception" ? "danger" : "info"}>{s.status.replace("_", " ")}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Lab results" />
            <CardBody className="space-y-2 text-sm">
              {kit.labResults.length === 0 ? <p className="text-ink-muted">No results yet.</p> : null}
              {kit.labResults.map((r) => (
                <div key={r.id} className="flex items-center justify-between">
                  <span className="text-ink-muted">{formatDateTime(r.reportedAt)}</span>
                  {r.healthStatus ? <Badge tone={HEALTH[r.healthStatus][0]}>{HEALTH[r.healthStatus][1]}</Badge> : <Badge tone="warning">Held</Badge>}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
