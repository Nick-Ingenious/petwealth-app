import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { listKits } from "@petwealth/api";
import { KIT_STATUS_META, KIT_STATUSES } from "@petwealth/domain";
import { Card, EmptyState, KitStatusBadge, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { FilterSelect, SearchBox } from "@/components/list-controls";
import { Pagination } from "@/components/pagination";
import { requireStaff } from "@/lib/auth";
import { formatDate, fullName, kitName } from "@/lib/format";

export const metadata = { title: "Tests" };

export default async function KitsPage({ searchParams }: PageProps<"/kits">) {
  const staff = await requireStaff("kits.view");
  const sp = await searchParams;
  const page = await listKits(staff, sp);
  return (
    <>
      <PageHeader icon={<FlaskConical className="size-6" />} title="Tests" description={`${page.total.toLocaleString()} kits`} />
      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBox placeholder="Search kit ID, customer, or pet…" />
        <FilterSelect name="status" label="All statuses" options={KIT_STATUSES.map((s) => ({ value: s, label: KIT_STATUS_META[s].label }))} />
      </div>
      <Card className="overflow-hidden">
        {page.items.length === 0 ? (
          <EmptyState icon={<FlaskConical className="size-8" />} title="No kits match" description="Try another search or status." />
        ) : (
          <Table>
            <THead>
              <tr><TH>Kit ID</TH><TH>Test</TH><TH>Customer</TH><TH>Pet</TH><TH>Ordered</TH><TH>Last update</TH><TH>Status</TH></tr>
            </THead>
            <TBody>
              {page.items.map((k) => (
                <TR key={k.id} className="relative">
                  <TD>
                    {k.code ? (
                      <Link href={`/kits/${k.code}`} className="font-mono font-medium text-brand-700 after:absolute after:inset-0">{k.code}</Link>
                    ) : (
                      <span className="text-ink-subtle">Not allocated</span>
                    )}
                  </TD>
                  <TD>{kitName(k)}</TD>
                  <TD>
                    <p>{fullName(k.customer)}</p>
                    <p className="text-xs text-ink-subtle">{k.customer?.email}</p>
                  </TD>
                  <TD>{k.pet ? k.pet.name : <span className="text-ink-subtle">—</span>}</TD>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDate(k.createdAt)}</TD>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDate(k.statusChangedAt)}</TD>
                  <TD><KitStatusBadge status={k.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination {...page} noun="kits" basePath="/kits" searchParams={sp} />
      </Card>
    </>
  );
}
