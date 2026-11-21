import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { AppError, getOrder } from "@petwealth/api";
import { Badge, Card, CardBody, CardHeader, DefinitionList, KitStatusBadge, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { Timeline } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { formatCents, formatDateTime, fullName, kitName, orderRef } from "@/lib/format";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export default async function OrderDetail({ params }: PageProps<"/orders/[id]">) {
  const staff = await requireStaff("orders.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const order = await getOrder(staff, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const addr = order.shippingAddress;
  const flags = order.timeline.filter((e) => e.type === "order.needs_attention");

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/orders" className="text-ink-muted hover:text-ink">← Orders</Link></p>
      <PageHeader
        icon={<Package className="size-6" />}
        title={orderRef(order.number)}
        description={`Shopify ${order.shopifyOrderName ?? "—"} · placed ${formatDateTime(order.placedAt)}`}
        actions={<Badge tone={order.status === "refunded" || order.status === "cancelled" ? "danger" : order.status === "fulfilled" ? "success" : "info"}>{order.status}</Badge>}
      />
      {flags.map((f) => {
        const items = (f.payload.items ?? f.payload.alreadyShipped) as string[] | undefined;
        return (
          <div key={f.id} role="alert" className="mb-6 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Needs attention</p>
            <p>{String(f.payload.action ?? f.payload.reason ?? "Review this order.")}</p>
            {items?.length ? <p className="mt-1 font-mono text-xs">{items.join(", ")}</p> : null}
          </div>
        );
      })}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader title="Kits" description="One kit per lab panel. Complete kits ship three." />
            <div className="mt-4">
              <Table>
                <THead><tr><TH>Kit ID</TH><TH>Test</TH><TH>Pet</TH><TH>Status</TH><TH>Tracking (out / return)</TH></tr></THead>
                <TBody>
                  {order.kits.map((k) => {
                    const out = k.shipments.find((s) => s.direction === "outbound");
                    const ret = k.shipments.find((s) => s.direction === "return");
                    return (
                      <TR key={k.id}>
                        <TD>{k.code ? <Link href={`/kits/${k.code}`} className="font-mono text-brand-700 hover:underline">{k.code}</Link> : <span className="text-ink-subtle">Not allocated</span>}</TD>
                        <TD>{kitName(k)}</TD>
                        <TD>{k.pet ? <Link href={`/pets/${k.pet.id}`} className="hover:underline">{k.pet.name}</Link> : <span className="text-ink-subtle">Not registered</span>}</TD>
                        <TD><KitStatusBadge status={k.status} /></TD>
                        <TD className="font-mono text-xs text-ink-muted">{out?.trackingNumber ?? "—"} / {ret?.trackingNumber ?? "—"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <Timeline events={order.timeline} kitCodes={new Map(order.kits.map((k) => [k.id, k.code]))} />
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer" />
            <CardBody>
              <Link href={`/customers/${order.customer.id}`} className="font-medium text-brand-700 hover:underline">{fullName(order.customer)}</Link>
              <p className="text-sm text-ink-muted">{order.customer.email}</p>
              {addr ? (
                <address className="mt-3 text-sm not-italic text-ink-muted">
                  {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}<br />
                  {addr.city}, {addr.region} {addr.postalCode}
                </address>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <ul className="mb-4 space-y-1 text-sm">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between"><span>{i.quantity} × {i.product.name}</span><span className="tabular-nums">{formatCents(i.unitPriceCents * i.quantity)}</span></li>
                ))}
              </ul>
              <DefinitionList
                items={[
                  { label: "Subtotal", value: formatCents(order.subtotalCents) },
                  { label: "Discount", value: order.discountCents ? `−${formatCents(order.discountCents)}` : null },
                  { label: "Tax", value: formatCents(order.taxCents) },
                  { label: "Total", value: <strong>{formatCents(order.totalCents)}</strong> },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
