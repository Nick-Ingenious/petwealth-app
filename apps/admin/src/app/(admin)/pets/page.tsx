import Link from "next/link";
import { PawPrint } from "lucide-react";
import { listPets } from "@petwealth/api";
import { SPECIES_LABEL } from "@petwealth/domain";
import { Card, EmptyState, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { SearchBox, Segmented } from "@/components/list-controls";
import { Pagination } from "@/components/pagination";
import { requireStaff } from "@/lib/auth";
import { formatDate, fullName, petAge, petRef } from "@/lib/format";

export const metadata = { title: "Pets" };

export default async function PetsPage({ searchParams }: PageProps<"/pets">) {
  const staff = await requireStaff("pets.view");
  const sp = await searchParams;
  const page = await listPets(staff, sp);
  return (
    <>
      <PageHeader icon={<PawPrint className="size-6" />} title="Pets" description={`${page.total.toLocaleString()} registered pets`} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search pet, breed, owner, or PET-ID…" />
        <Segmented name="species" options={[{ value: "dog", label: "Dogs" }, { value: "cat", label: "Cats" }]} />
      </div>
      <Card className="overflow-hidden">
        {page.items.length === 0 ? (
          <EmptyState icon={<PawPrint className="size-8" />} title="No pets match" />
        ) : (
          <Table>
            <THead><tr><TH>Pet</TH><TH>Breed</TH><TH>Age</TH><TH>Owner</TH><TH className="text-right">Tests</TH><TH>Registered</TH></tr></THead>
            <TBody>
              {page.items.map((p) => (
                <TR key={p.id} className="relative">
                  <TD>
                    <Link href={`/pets/${p.id}`} className="font-medium text-ink after:absolute after:inset-0">{p.name}</Link>
                    <p className="text-xs text-ink-subtle">{petRef(p.number)} · {SPECIES_LABEL[p.species].noun}</p>
                  </TD>
                  <TD>{p.breed ?? "—"}</TD>
                  <TD className="whitespace-nowrap">
                    {petAge(p.dateOfBirth)}
                    <p className="text-xs text-ink-subtle">{p.dateOfBirth ?? ""}</p>
                  </TD>
                  <TD>{fullName(p.owner)}</TD>
                  <TD className="text-right tabular-nums">{p.kitCount}</TD>
                  <TD className="whitespace-nowrap text-ink-muted">{formatDate(p.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination {...page} noun="pets" basePath="/pets" searchParams={sp} />
      </Card>
    </>
  );
}
