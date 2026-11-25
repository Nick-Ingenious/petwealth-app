import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { can, listOrders } from "@petwealth/api";
import { KIT_STATUS_META, KIT_STATUSES } from "@petwealth/domain";
import { Badge, Card, EmptyState, KitStatusBadge, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { FilterSelect, SearchBox } from "@/components/list-controls";
import { Pagination } from "@/components/pagination";
import { requireStaff } from "@/lib/auth";
import { formatCents, formatDate, fullName, orderRef } from "@/lib/format";
import { SyncShippingButton } from "./sync-button";

export const metadata = { title: "Orders" };

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const staff = await requireStaff("orders.view");
  const sp = await searchParams;
  const page = await listOrders(staff, sp);

  return (
    <>
      <PageHeader
        icon={<Package className="size-6" />}
        title="Orders"
        description={`${page.total.toLocaleString()} orders`}
        actions={
          can(staff, "orders.manage") ? <SyncShippingButton configured={Boolean(
                process.env.SHOPIFY_SHOP_DOMAIN &&
                  ((process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
              )} /> : undefined
        }
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBox placeholder="Search order #, customer, or kit ID…" />
        <FilterSelect name="status" label="Any kit stage" options={KIT_STATUSES.map((s) => ({ value: s, label: KIT_STATUS_META[s].label }))} />
      </div>
      <Card className="overflow-hidden">
        {page.items.length === 0 ? (
          <EmptyState icon={<Package className="size-8" />} title="No orders match" description="Try a different search or clear the stage filter." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Customer</TH>
                <TH>Test</TH>
                <TH>Kits</TH>
                <TH>Placed</TH>
                <TH className="text-right">Total</TH>
                <TH><span className="sr-only">Open</span></TH>
              </tr>
            </THead>
            <TBody>
              {page.items.map((o) => (
                <TR key={o.id} className="relative">
                  <TD>
                    <Link href={`/orders/${o.id}`} className="whitespace-nowrap font-semibold text-ink after:absolute after:inset-0">
                      {orderRef(o.number)}
                    </Link>
                    <p className="text-xs text-ink-subtle">
                      Shopify {o.shopifyOrderName ?? "—"}
                      {o.source === "wholesale" ? <Badge tone="brand" className="ml-2">Wholesale</Badge> : null}
                    </p>
                  </TD>
                  <TD>
                    <p className="text-ink">{fullName(o.customer)}</p>
                    <p className="text-xs text-ink-subtle">{o.customer.email}</p>
                  </TD>
                  <TD className="min-w-40 text-ink-muted">{o.products.join(", ")}</TD>
                  <TD>
                    <ul className="space-y-1">
                      {o.kits.map((k, i) => (
                        <li key={k.code ?? i} className="flex flex-wrap items-center gap-2">
                          <span className="whitespace-nowrap font-mono text-xs text-ink-muted">{k.code ?? "Not allocated"}</span>
                          <KitStatusBadge status={k.status} />
                          {k.petName ? <span className="text-xs text-ink-subtle">{k.petName}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDate(o.placedAt)}</TD>
                  <TD className="text-right tabular-nums">
                    {formatCents(o.totalCents)}
                    {o.status === "refunded" || o.status === "cancelled" ? <p className="text-xs capitalize text-red-600">{o.status}</p> : null}
                  </TD>
                  <TD className="w-8 text-ink-subtle"><ChevronRight className="size-4" /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination {...page} noun="orders" basePath="/orders" searchParams={sp} />
      </Card>
    </>
  );
}
