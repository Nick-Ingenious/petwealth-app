import Link from "next/link";
import { DollarSign, FlaskConical, LayoutGrid, Package, Users } from "lucide-react";
import { getDashboard } from "@petwealth/api";
import { KIT_STATUS_META, PANEL_LABEL, PANELS, PIPELINE_STATUSES, SPECIES_LABEL, formatCents } from "@petwealth/domain";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@petwealth/ui";
import { FilterSelect } from "@/components/list-controls";
import { OrdersChart } from "@/components/orders-chart";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Dashboard" };

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const staff = await requireStaff("dashboard.view");
  const sp = await searchParams;
  const d = await getDashboard(staff, { days: sp.days });
  const label = RANGES.find((r) => r.value === String(d.range.days))?.label ?? "";

  return (
    <>
      <PageHeader
        icon={<LayoutGrid className="size-6" />}
        title="Dashboard"
        description={`Welcome back${staff.name ? `, ${staff.name.split(" ")[0]}` : ""}. Here's your Petwealth overview.`}
        actions={<FilterSelect name="days" label="Last 30 days" options={RANGES.filter((r) => r.value !== "30")} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Package className="size-5" />} label={`Orders · ${label}`} value={d.kpis.orders.value.toLocaleString()} change={d.kpis.orders.changePct} hint={`${plural(d.kpis.orders.kits, "kit")} total · change vs previous period`} />
        <StatCard icon={<DollarSign className="size-5" />} label={`Revenue · ${label}`} value={formatCents(d.kpis.revenueCents.value)} change={d.kpis.revenueCents.changePct} hint="Excludes refunded orders" />
        <StatCard icon={<Users className="size-5" />} label="Customers (all time)" value={d.kpis.customers.value.toLocaleString()} change={d.kpis.customers.changePct} hint={`${d.kpis.customers.newInRange} new · ${label.toLowerCase()}`} />
        <StatCard icon={<FlaskConical className="size-5" />} label="Kits at or headed to the lab" value={d.kpis.inProgressKits.value.toLocaleString()} hint="In transit, received, processing, rerun" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Kit pipeline" description="Current status of every kit. Click a stage to see its kits." />
        <CardBody>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
            {PIPELINE_STATUSES.map((st, i) => (
              <li key={st}>
                <Link href={`/kits?status=${st}` as never} className="group flex h-full flex-col items-center rounded-xl border border-transparent p-3 text-center transition hover:border-line hover:bg-canvas">
                  <span className="text-xs font-medium text-ink-subtle">{i + 1}</span>
                  <span className="mt-1 text-2xl font-semibold tabular-nums text-ink group-hover:text-brand-700">{d.pipeline[st].toLocaleString()}</span>
                  <span className="mt-1 text-xs leading-tight text-ink-muted">{KIT_STATUS_META[st].label}</span>
                </Link>
              </li>
            ))}
          </ol>
          {d.pipeline.rerun || d.pipeline.cancelled ? (
            <p className="mt-3 text-sm text-ink-muted">
              Also: <Link className="font-medium text-amber-700 hover:underline" href={"/kits?status=rerun" as never}>{d.pipeline.rerun} in rerun</Link>
              {" · "}
              <Link className="font-medium text-ink hover:underline" href={"/kits?status=cancelled" as never}>{d.pipeline.cancelled} cancelled</Link>
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue" description={`${label} · by ${d.range.bucket}`} />
          <CardBody>
            <OrdersChart data={d.series} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Kits ordered by type"
            description={`${plural(d.kpis.orders.kits, "kit")} in ${plural(d.kpis.orders.value, "order")} · ${label}`}
          />
          <CardBody className="space-y-5">
            {(["dog", "cat"] as const).map((species) => {
              const rows = PANELS.map((panel) => ({ panel, n: d.kitsByPanel.find((r) => r.species === species && r.panel === panel)?.n ?? 0 }));
              const max = Math.max(1, ...d.kitsByPanel.map((r) => r.n));
              return (
                <div key={species}>
                  <p className="mb-2 text-sm font-medium text-ink">{SPECIES_LABEL[species].adjective}</p>
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li key={r.panel} className="grid grid-cols-[6.5rem_minmax(4rem,1fr)_2.5rem] items-center gap-3 text-sm">
                        <span className="text-ink-muted">{PANEL_LABEL[r.panel]}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-canvas">
                          <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(r.n / max) * 100}%` }} />
                        </span>
                        <span className="text-right tabular-nums text-ink">{r.n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
