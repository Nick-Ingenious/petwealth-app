import { ImageIcon } from "lucide-react";
import { can, listBreedAvatars } from "@petwealth/api";
import { SPECIES_LABEL } from "@petwealth/domain";
import { Card, EmptyState, PageHeader } from "@petwealth/ui";
import { SearchBox, Segmented } from "@/components/list-controls";
import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { RedrawButton } from "./redraw-button";

export const metadata = { title: "Breed Pictures" };
/** Redrawing a picture takes 10 to 20 seconds. */
export const maxDuration = 60;

export default async function BreedPicturesPage({ searchParams }: PageProps<"/breed-pictures">) {
  const staff = await requireStaff("pets.view");
  const sp = await searchParams;
  const items = await listBreedAvatars(staff, sp);
  const canManage = can(staff, "pets.manage");
  const inUse = items.reduce((n, i) => n + i.petCount, 0);

  return (
    <>
      <PageHeader
        icon={<ImageIcon className="size-6" />}
        title="Breed Pictures"
        description={`AI pictures shown for pets without a photo of their own. One per breed, shared by every pet of that breed. ${items.length} pictures, shown on ${inUse} pets.`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox placeholder="Search breed…" />
        <Segmented name="species" options={[{ value: "dog", label: "Dogs" }, { value: "cat", label: "Cats" }]} />
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ImageIcon className="size-8" />}
            title="No breed pictures yet"
            description="A picture is drawn the first time a customer picks that breed in the app."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          {items.map((a) => (
            <li key={a.id}>
              <Card className="flex h-full flex-col overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={`AI picture of a ${a.breed}`} loading="lazy" className="aspect-square w-full bg-canvas object-cover" />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div>
                    <p className="font-medium leading-tight">{a.breed}</p>
                    <p className="text-xs text-ink-muted">
                      {SPECIES_LABEL[a.species].noun} · {a.petCount === 1 ? "1 pet" : `${a.petCount} pets`}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {a.redrawn ? "Redrawn" : "Drawn"} {formatDate(a.updatedAt)}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="mt-auto">
                      <RedrawButton id={a.id} breed={a.breed} petCount={a.petCount} />
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
