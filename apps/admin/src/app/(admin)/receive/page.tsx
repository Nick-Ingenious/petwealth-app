import Link from "next/link";
import { Barcode } from "lucide-react";
import { listRecentlyReceived } from "@petwealth/api";
import { SPECIES_LABEL } from "@petwealth/domain";
import { Card, CardBody, CardHeader, EmptyState, KitStatusBadge, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { formatDateTime, kitName } from "@/lib/format";
import { Scanner } from "./scanner";

export const metadata = { title: "Receive Kits" };

export default async function ReceivePage() {
  const staff = await requireStaff("kits.receive");
  const recent = await listRecentlyReceived(staff, 25);
  return (
    <>
      <PageHeader icon={<Barcode className="size-6" />} title="Receive Kits" description="Scan kits as they arrive at the lab." />
      <Card>
        <CardBody className="py-10"><Scanner /></CardBody>
      </Card>
      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Recently received" description="Last 25 lab check-ins" />
        <div className="mt-4">
          {recent.length === 0 ? (
            <EmptyState title="No kits received yet" />
          ) : (
            <Table>
              <THead><tr><TH>Kit ID</TH><TH>Pet</TH><TH>Species</TH><TH>Test</TH><TH>Received</TH><TH>Status</TH></tr></THead>
              <TBody>
                {recent.map((k) => (
                  <TR key={k.code}>
                    <TD><Link href={`/kits/${k.code}`} className="font-mono text-brand-700 hover:underline">{k.code}</Link></TD>
                    <TD>{k.petName ?? <span className="text-amber-700">Not registered</span>}</TD>
                    <TD>{SPECIES_LABEL[k.species].noun}</TD>
                    <TD>{kitName(k)}</TD>
                    <TD className="whitespace-nowrap text-ink-muted">{formatDateTime(k.receivedAt)}</TD>
                    <TD><KitStatusBadge status={k.status} /></TD>
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
