import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { AppError, can, getCustomer } from "@petwealth/api";
import { SPECIES_LABEL } from "@petwealth/domain";
import { Badge, Card, CardBody, CardHeader, KitStatusBadge, PageHeader } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { customerRef, formatCents, formatDate, formatDateTime, fullName, orderRef, petAge } from "@/lib/format";
import { CustomerForm } from "./customer-form";

const TEMPLATE_LABEL: Record<string, string> = { kit_shipped: "Kit shipped", kit_received: "Kit received at lab", results_ready: "Results ready" };

export default async function CustomerDetail({ params }: PageProps<"/customers/[id]">) {
  const staff = await requireStaff("customers.view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await getCustomer(staff, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
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
