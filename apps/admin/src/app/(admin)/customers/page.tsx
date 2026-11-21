import Link from "next/link";
import { Users } from "lucide-react";
import { listCustomers } from "@petwealth/api";
import { Badge, Card, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { SearchBox } from "@/components/list-controls";
import { Pagination } from "@/components/pagination";
import { requireStaff } from "@/lib/auth";
import { customerRef, formatCents, formatDate, fullName } from "@/lib/format";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const staff = await requireStaff("customers.view");
  const sp = await searchParams;
  const page = await listCustomers(staff, sp);
  return (
    <>
      <PageHeader icon={<Users className="size-6" />} title="Customers" description={`${page.total.toLocaleString()} registered accounts`} />
      <div className="mb-4"><SearchBox placeholder="Search name, email, phone, or CUS-ID…" /></div>
      <Card className="overflow-hidden">
        {page.items.length === 0 ? (
          <EmptyState icon={<Users className="size-8" />} title="No customers match" />
        ) : (
          <Table>
            <THead>
              <tr><TH>Customer</TH><TH>Contact</TH><TH>SMS</TH><TH className="text-right">Pets</TH><TH className="text-right">Orders</TH><TH className="text-right">Total spent</TH><TH>Joined</TH></tr>
            </THead>
            <TBody>
              {page.items.map((c) => (
                <TR key={c.id} className="relative">
                  <TD>
                    <Link href={`/customers/${c.id}`} className="font-medium text-ink after:absolute after:inset-0">{fullName(c)}</Link>
                    <p className="text-xs text-ink-subtle">{customerRef(c.number)}{c.status === "disabled" ? " · disabled" : ""}</p>
                  </TD>
                  <TD>
                    <p>{c.email}</p>
                    <p className="text-xs text-ink-subtle">{c.phone ?? "No phone"}</p>
                  </TD>
                  <TD>{c.smsOptIn && c.phone ? <Badge tone="success">Opted in</Badge> : <Badge>Off</Badge>}</TD>
                  <TD className="text-right tabular-nums">{c.petCount}</TD>
                  <TD className="text-right tabular-nums">{c.orderCount}</TD>
                  <TD className="text-right tabular-nums">{formatCents(c.totalSpentCents)}</TD>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDate(c.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination {...page} noun="customers" basePath="/customers" searchParams={sp} />
      </Card>
    </>
  );
}
