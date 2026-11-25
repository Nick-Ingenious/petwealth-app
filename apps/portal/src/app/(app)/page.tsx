import { getPortalHome } from "@petwealth/api";
import { kitDisplayName, type KitStatus } from "@petwealth/domain";
import { requireCustomer } from "@/lib/auth";
import { CLERK_ENABLED } from "@/lib/env";
import { Dashboard, type TestRow } from "./dashboard";

export const metadata = { title: "Dashboard" };

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/** Same buckets as the old app: registered until the lab has it, processing at the lab, completed when results are out. */
function groupFor(status: KitStatus): TestRow["group"] {
  if (status === "completed") return "completed";
  if (status === "received_at_lab" || status === "processing" || status === "rerun") return "processing";
  return "registered";
}

function greetingFor(firstName: string | null, now = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }).format(now));
  const period = hour >= 5 && hour < 12 ? "morning" : hour >= 12 && hour < 18 ? "afternoon" : "evening";
  const name = firstName?.trim().split(/\s+/)[0];
  return name && !name.includes("@") ? `Good ${period}, ${name}` : `Good ${period}`;
}

export default async function HomePage() {
  const ctx = await requireCustomer({ next: "/" });
  const home = await getPortalHome(ctx);

  const rows: TestRow[] = [...home.activeKits, ...home.completedKits]
    .map((k) => ({
      code: k.code,
      href: k.hasResults ? `/kits/${k.code}/results` : `/kits/${k.code}`,
      petName: k.pet?.name ?? null,
      petPhoto: k.pet?.photoUrl ?? null,
      species: k.species,
      kitName: kitDisplayName(k.species, k.panel),
      registeredAt: k.activatedAt ?? k.statusChangedAt,
      group: groupFor(k.status),
      hasResults: k.hasResults,
    }))
    // Newest registration first, as in the old app.
    .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
    .map(({ registeredAt, ...r }) => ({ ...r, date: dateFmt.format(new Date(registeredAt)) }));

  return <Dashboard greeting={greetingFor(home.profile.firstName)} firstName={home.profile.firstName} rows={rows} clerk={CLERK_ENABLED} />;
}
