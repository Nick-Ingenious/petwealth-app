import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { AppError, can, getCustomer, listCustomerShipments } from "@petwealth/api";
import { SPECIES_LABEL } from "@petwealth/domain";
import { Badge, Card, CardBody, CardHeader, KitStatusBadge, PageHeader } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { customerRef, formatCents, formatDate, formatDateTime, fullName, orderRef, petAge } from "@/lib/format";
import { ShipmentStatusBadge } from "@/components/shipment-status";
import { CustomerForm } from "./customer-form";
import { RegisterKits } from "./register-kits";
import { RetryLabel } from "./retry-label";

const TEMPLATE_LABEL: Record<string, string> = {
  kit_shipped: "Kit shipped",
  kit_in_transit: "Kit on its way to the lab",
  kit_received: "Kit received at lab",
  results_ready: "Results ready",
  return_label_ready: "FedEx return code",
};

export default async function CustomerDetail({ params }: PageProps<"/customers/[id]">) {
  const staff = await requireStaff("customers.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await getCustomer(staff, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const mailers = can(staff, "kits.view") ? await listCustomerShipments(staff, c.id) : [];
  const returns = mailers.filter((m) => m.direction === "return");
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/customers" className="text-ink-muted hover:text-ink">← Customers</Link></p>
      <PageHeader icon={<Users className="size-6" />} title={fullName(c)} description={`${customerRef(c.number)} · joined ${formatDate(c.createdAt)}`} actions={c.status === "disabled" ? <Badge tone="danger">Disabled</Badge> : <Badge tone="success">Active</Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <CustomerForm
                id={c.id}
                canEdit={can(staff, "customers.manage")}
                initial={{ firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email, phone: c.phone ?? "", smsOptIn: c.smsOptIn }}
              />
            </CardBody>
          </Card>
          {can(staff, "kits.manage") ? (
            <Card>
              <CardHeader title="Register kits" description="For phone support: scan the customer's tubes and choose each pet, as they would in the app." />
              <CardBody>
                <RegisterKits customerId={c.id} pets={c.pets.map((p) => ({ id: p.id, name: p.name, species: p.species }))} />
              </CardBody>
            </Card>
          ) : null}
          {can(staff, "kits.view") ? (
            <Card>
              <CardHeader title="Return mailers" description="One FedEx code per group of kits registered together." />
              <CardBody>
                {returns.length === 0 ? <p className="text-sm text-ink-muted">No kits registered yet.</p> : null}
                <ul className="divide-y divide-line">
                  {returns.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="space-y-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-medium">{m.rmaNumber}</span>
                          <ShipmentStatusBadge status={m.status} />
                          {m.carrier === "test" ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Test carrier</span> : null}
                        </p>
                        <p className="text-xs text-ink-subtle">
                          {formatDateTime(m.createdAt)}
                          {m.trackingNumber ? ` · FedEx ${m.trackingNumber}` : ""}
                          {m.statusDetail ? ` · ${m.statusDetail}` : ""}
                        </p>
                        <p className="flex flex-wrap gap-1.5 text-xs">
                          {m.kits.map(({ kit }) => (
                            <Link key={kit.id} href={`/kits/${kit.code}`} className="rounded bg-canvas px-1.5 py-0.5 font-mono text-brand-700 hover:underline">
                              {kit.code}
                              {kit.pet ? ` · ${kit.pet.name}` : ""}
                            </Link>
                          ))}
                        </p>
                        {m.status === "failed" && m.error ? <p className="text-xs text-red-600">{m.error}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {m.labelFormat && m.status !== "failed" && m.status !== "pending" ? (
                          <a href={`/api/v1/shipments/${m.id}/label`} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
                            {m.labelFormat === "qr_png" ? "View QR code" : "View label"}
                          </a>
                        ) : null}
                        {(m.status === "failed" || m.status === "pending") && can(staff, "kits.manage") ? <RetryLabel customerId={c.id} shipmentId={m.id} /> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Orders" description={`${c.orders.length} total`} />
            <CardBody>
              {c.orders.length === 0 ? <p className="text-sm text-ink-muted">No orders yet.</p> : null}
              <ul className="divide-y divide-line">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">{orderRef(o.number)}</Link>
                      <p className="text-xs text-ink-subtle">{formatDate(o.placedAt)} · {formatCents(o.totalCents)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">{o.kits.map((k) => <KitStatusBadge key={k.id} status={k.status} />)}</div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Pets" />
            <CardBody className="space-y-3">
              {c.pets.length === 0 ? <p className="text-sm text-ink-muted">No pets registered.</p> : null}
              {c.pets.map((p) => (
                <Link key={p.id} href={`/pets/${p.id}`} className="block rounded-lg border border-line p-3 hover:bg-canvas">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-ink-muted">{SPECIES_LABEL[p.species].noun} · {p.breed ?? "Unknown breed"} · {petAge(p.dateOfBirth)}</p>
                </Link>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Addresses" />
            <CardBody className="space-y-2 text-sm text-ink-muted">
              {c.addresses.map((a) => (
                <address key={a.id} className="not-italic">{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.region} {a.postalCode}</address>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Messages" description="Most recent 20" />
            <CardBody className="space-y-2 text-sm">
              {c.notifications.length === 0 ? <p className="text-ink-muted">No messages sent.</p> : null}
              {c.notifications.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2">
                  <div>
                    <p>{TEMPLATE_LABEL[n.template] ?? n.template}</p>
                    <p className="text-xs text-ink-subtle">{n.channel.toUpperCase()} · {formatDateTime(n.sentAt ?? n.createdAt)}</p>
                  </div>
                  <Badge tone={n.status === "delivered" || n.status === "sent" ? "success" : n.status === "failed" ? "danger" : "neutral"}>{n.status}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
