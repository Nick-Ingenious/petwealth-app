import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Clock,
  FlaskConical,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  QrCode,
  Receipt,
  ShoppingBag,
  Truck,
  User,
  type LucideIcon,
} from "lucide-react";
import { AppError, can, getOrder } from "@petwealth/api";
import { ROLE_LABEL, SPECIES_LABEL, type Species, type TestType } from "@petwealth/domain";
import { Badge, Button, Card, EmptyState, KitStatusBadge, cn, type Tone } from "@petwealth/ui";
import { describeEvent, type EventRow } from "@/components/timeline";
import { requireStaff } from "@/lib/auth";
import { formatCents, formatDate, formatDateTime, fullName, kitName, orderRef } from "@/lib/format";
import { NoteForm } from "./note-form";
import { computeSteps, ORDER_STEPS, TEST_STEPS, type StepKey, type StepState } from "./progress";

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

const STEP_ICON: Record<StepKey, LucideIcon> = {
  ordered: Package,
  shipped: Truck,
  delivered: MapPin,
  registered: QrCode,
  mailed: Mail,
  received: Package,
  processing: FlaskConical,
  results: ClipboardCheck,
};

const PRODUCT_BLURB: Record<TestType, (pet: string) => string> = {
  fecal: (pet) => `Screen your ${pet}'s gut for parasites, bacteria and other pathogens with at-home testing.`,
  respiratory: (pet) => `Screen for respiratory pathogens that may be affecting your ${pet}'s health with at-home testing.`,
  oral: (pet) => `Check your ${pet}'s mouth for bacteria linked to dental disease with at-home testing.`,
  complete: (pet) => `Fecal, respiratory and oral panels for your ${pet} — three kits in one bundle.`,
};
const productBlurb = (p: { species: Species; testType: TestType }) => PRODUCT_BLURB[p.testType](SPECIES_LABEL[p.species].noun.toLowerCase());

const ACTOR_CHIP: Record<string, string> = { staff: "Staff", customer: "Pet Owner", integration: "Integration", system: "System" };

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
  const kitCodes = new Map(order.kits.map((k) => [k.id, k.code]));
  const orderSteps = computeSteps(ORDER_STEPS, order.kits, order.timeline, order.placedAt);
  const testSteps = computeSteps(TEST_STEPS, order.kits, order.timeline, order.placedAt);
  const shipments = order.kits.flatMap((k) => k.shipments.map((s) => ({ ...s, kit: k })));
  const testTypes = [...new Set(order.kits.map(kitName))];
  const pets = [...new Map(order.kits.flatMap((k) => (k.pet ? [[k.pet.id, k.pet] as const] : []))).values()];

  const closed = order.status === "cancelled" || order.status === "refunded";
  const stage = [...testSteps, ...orderSteps].find((s) => s.current);
  const headerBadge: { tone: Tone; label: string } = closed
    ? { tone: "danger", label: order.status === "refunded" ? "Refunded" : "Cancelled" }
    : order.status === "fulfilled" && !stage
      ? { tone: "success", label: "Fulfilled" }
      : { tone: stage?.key === "results" ? "success" : stage?.key === "ordered" ? "neutral" : "progress", label: stage?.label ?? "Open" };

  return (
    <div className="space-y-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
        <ChevronLeft className="size-4" aria-hidden /> Back
      </Link>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{orderRef(order.number)}</h1>
          <Badge tone={headerBadge.tone}>{headerBadge.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Ordered {formatDate(order.placedAt)} · {formatCents(order.totalCents)}
          {order.shopifyOrderName ? ` · Shopify ${order.shopifyOrderName}` : ""}
        </p>
        <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryItem label="Kit(s)">
            {order.kits.length ? (
              <ul className="space-y-1.5">
                {order.kits.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2">
                    {k.code ? (
                      <Link href={`/kits/${k.code}`} className="font-mono text-sm font-medium text-brand-700 hover:underline">{k.code}</Link>
                    ) : (
                      <span className="text-sm text-ink-subtle">Not allocated</span>
                    )}
                    <KitStatusBadge status={k.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </SummaryItem>
          <SummaryItem label="Test Type">{testTypes.length ? testTypes.join(", ") : null}</SummaryItem>
          <SummaryItem label="Customer">
            <Link href={`/customers/${order.customer.id}`} className="font-medium text-brand-700 hover:underline">{fullName(order.customer)}</Link>
          </SummaryItem>
          <SummaryItem label="Pet">
            {pets.length
              ? pets.map((p, i) => (
                  <span key={p.id}>
                    {i ? ", " : ""}
                    <Link href={`/pets/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>
                  </span>
                ))
              : null}
          </SummaryItem>
        </dl>
      </Card>

      {flags.map((f) => {
        const items = (f.payload.items ?? f.payload.alreadyShipped) as string[] | undefined;
        return (
          <div key={f.id} role="alert" className="flex gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Needs attention</p>
              <p>{String(f.payload.action ?? f.payload.reason ?? "Review this order.")}</p>
              {items?.length ? <p className="mt-1 font-mono text-xs">{items.join(", ")}</p> : null}
            </div>
          </div>
        );
      })}

      {/* ── Progress ────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 p-6">
          <SectionTitle>Order Progress</SectionTitle>
          <Stepper steps={orderSteps} />
        </Card>
        <Card className="min-w-0 p-6">
          <SectionTitle>Test Progress</SectionTitle>
          <Stepper steps={testSteps} />
        </Card>
      </div>

      {/* ── Shipping & tracking ─────────────────────────────────── */}
      <Card className="p-6">
        <SectionTitle>Shipping &amp; Tracking</SectionTitle>
        {shipments.length ? (
          <ul className="divide-y divide-line">
            {shipments.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                    <Truck className="size-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {s.direction === "outbound" ? "Outbound to customer" : "Return to lab"}
                      {s.kit.code ? <span className="ml-2 font-mono text-xs text-ink-muted">{s.kit.code}</span> : null}
                    </p>
                    <p className="font-mono text-xs text-ink-muted">
                      {s.carrier.toUpperCase()} {s.trackingNumber}
                    </p>
                  </div>
                </div>
                <Badge tone={s.status === "delivered" ? "success" : s.status === "exception" || s.status === "voided" ? "danger" : "info"}>
                  <span className="capitalize">{s.status.replace("_", " ")}</span>
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={
              <div className="grid size-16 place-items-center rounded-2xl bg-canvas">
                <Package className="size-8" aria-hidden />
              </div>
            }
            title="No shipping information added yet"
            description="Add tracking numbers to enable automatic status updates for this order."
            action={
              <Button variant="brand" disabled title="Tracking numbers can be added once the FedEx integration is live">
                <Truck className="size-4" aria-hidden /> Add shipping information
              </Button>
            }
          />
        )}
      </Card>

      {/* ── Timelines ───────────────────────────────────────────── */}
      <Card className="p-6">
        <SectionTitle>Order timeline</SectionTitle>
        <StepList steps={orderSteps} />
      </Card>
      <Card className="p-6">
        <SectionTitle>Test timeline</SectionTitle>
        <StepList steps={testSteps} />
      </Card>

      {/* ── Receipt & payment ───────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Receipt className="size-4" aria-hidden />
          </div>
          <h2 className="text-lg font-semibold text-ink">Order Receipt &amp; Payment</h2>
        </div>
        <dl className="grid gap-6 border-b border-line pb-6 sm:grid-cols-3">
          <SummaryItem label="Receipt No.">
            <span className="font-mono font-semibold text-brand-700">{order.shopifyOrderName ?? orderRef(order.number)}</span>
          </SummaryItem>
          <SummaryItem label="Order Date">{formatDate(order.placedAt)}</SummaryItem>
          <SummaryItem label="Payment Date">{order.source === "shopify" ? formatDate(order.placedAt) : null}</SummaryItem>
        </dl>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold tracking-wider text-ink-subtle uppercase">
                <th className="py-4 pr-4 font-semibold">Item</th>
                <th className="py-4 pr-4 font-semibold">Description</th>
                <th className="py-4 pr-4 text-center font-semibold">Qty</th>
                <th className="py-4 pr-4 text-right font-semibold">Unit price</th>
                <th className="py-4 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-4 pr-4 font-medium text-ink">{i.product.name}</td>
                  <td className="max-w-md py-4 pr-4 text-ink-muted">{productBlurb(i.product)}</td>
                  <td className="py-4 pr-4 text-center tabular-nums text-ink-muted">{i.quantity}</td>
                  <td className="py-4 pr-4 text-right font-semibold tabular-nums">{formatCents(i.unitPriceCents)}</td>
                  <td className="py-4 text-right font-semibold tabular-nums">{formatCents(i.unitPriceCents * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex justify-end border-t border-line pt-5">
          <dl className="w-full max-w-xs space-y-2.5 text-sm">
            <TotalRow label="Subtotal" value={formatCents(order.subtotalCents)} />
            {order.discountCents ? <TotalRow label="Discount" value={`−${formatCents(order.discountCents)}`} /> : null}
            {order.shippingCents ? <TotalRow label="Shipping" value={formatCents(order.shippingCents)} /> : null}
            <TotalRow label="Tax" value={formatCents(order.taxCents)} />
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="text-2xl font-bold tabular-nums text-brand-600">{formatCents(order.totalCents)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 grid gap-4 border-t border-line pt-6 md:grid-cols-2">
          <InfoPanel tone="brand" icon={MapPin} title="Shipping To:">
            {addr ? (
              <address className="not-italic">
                {addr.line1}
                {addr.line2 ? <>, {addr.line2}</> : null}
                <br />
                {addr.city}, {addr.region} {addr.postalCode}
                <br />
                {addr.country === "US" ? "United States" : addr.country}
              </address>
            ) : (
              <p>No shipping address on file.</p>
            )}
          </InfoPanel>
          <InfoPanel tone="brand" icon={User} title="Billing Contact:">
            <p>{fullName(order.customer)}</p>
            <p>{order.customer.email}</p>
            {order.customer.phone ? <p>{order.customer.phone}</p> : null}
          </InfoPanel>
          <InfoPanel tone="info" icon={ShoppingBag} title="Payment Method">
            <p>{order.source === "shopify" ? "Paid through Shopify checkout" : `${order.source[0]!.toUpperCase()}${order.source.slice(1)} order`}</p>
            {order.shopifyOrderId ? <p className="font-mono text-xs opacity-80">Shopify ID: {order.shopifyOrderId}</p> : null}
          </InfoPanel>
          {closed ? (
            <InfoPanel tone="danger" icon={AlertTriangle} title={order.status === "refunded" ? "Payment Refunded" : "Order Cancelled"}>
              <p>{order.cancelReason ?? "No reason recorded."}</p>
              {order.cancelledAt ? <p className="font-mono text-xs opacity-80">{formatDate(order.cancelledAt)}</p> : null}
            </InfoPanel>
          ) : (
            <InfoPanel tone="success" icon={CheckCircle2} title="Payment Complete">
              <p>Charged {formatCents(order.totalCents)}</p>
              <p className="font-mono text-xs opacity-80">{formatDate(order.placedAt)}</p>
            </InfoPanel>
          )}
        </div>
      </Card>

      {/* ── Activity log & notes ────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <MessageSquare className="size-5 text-brand-600" aria-hidden /> Activity Log &amp; Notes
          </h2>
          <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs text-ink-muted">
            {order.timeline.length} {order.timeline.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        {can(staff, "orders.manage") ? (
          <div className="mb-6 rounded-xl border border-line bg-canvas/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Avatar label={staff.email} />
              <span className="text-sm text-ink">{staff.email}</span>
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">{ROLE_LABEL[staff.role]}</span>
            </div>
            <NoteForm orderId={order.id} />
          </div>
        ) : null}
        {order.timeline.length ? (
          <ol className="space-y-5">
            {order.timeline.map((e) => (
              <ActivityItem key={e.id} event={e} kitCode={kitCodes.get(e.entityId) ?? null} />
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-muted">No activity yet.</p>
        )}
      </Card>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-5 text-lg font-semibold text-ink">{children}</h2>;
}

function SummaryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children ?? <span className="text-ink-subtle">—</span>}</dd>
    </div>
  );
}

function Stepper({ steps }: { steps: StepState[] }) {
  return (
    <ol className="-mx-1 flex items-start overflow-x-auto px-1 pb-1">
      {steps.map((s, i) => {
        const Icon = STEP_ICON[s.key];
        return (
          <li key={s.key} className={cn("flex items-start", i > 0 && "flex-1")}>
            {i > 0 ? <span className={cn("mx-1.5 mt-5 h-px min-w-3 flex-1", s.done ? "bg-brand-400" : "bg-line")} aria-hidden /> : null}
            <div className="flex w-16 shrink-0 flex-col sm:w-[4.75rem] items-center gap-2 text-center">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-xl",
                  s.current ? "bg-brand-600 text-white shadow-sm ring-4 ring-brand-100" : s.done ? "bg-brand-100 text-brand-700" : "bg-canvas text-ink-subtle ring-1 ring-line",
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className={cn("text-xs leading-tight", s.current ? "font-semibold text-ink" : s.done ? "font-medium text-ink-muted" : "text-ink-subtle")}>
                {s.label}
                <span className="sr-only">{s.done ? " (done)" : " (pending)"}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepList({ steps }: { steps: StepState[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s) => (
        <li key={s.key} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {s.done ? (
              <CheckCircle2 className="size-7 rounded-full bg-emerald-500 p-1 text-white" aria-label="Done" />
            ) : (
              <Clock className="size-7 rounded-full bg-canvas p-1.5 text-ink-subtle ring-1 ring-line" aria-label="Pending" />
            )}
            <span className={s.done ? "text-ink" : "text-ink-subtle"}>{s.label}</span>
          </div>
          <span className="text-sm tabular-nums text-ink-subtle">{s.at ? formatDateTime(s.at) : s.done ? "Done" : "—"}</span>
        </li>
      ))}
    </ol>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}

const PANEL_TONES = {
  brand: "border-brand-100 bg-brand-50/50 text-brand-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  danger: "border-red-200 bg-red-50 text-red-800",
} as const;

function InfoPanel({ tone, icon: Icon, title, children }: { tone: keyof typeof PANEL_TONES; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-5", PANEL_TONES[tone])}>
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <Icon className="size-4" aria-hidden /> {title}
      </p>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white" aria-hidden>
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ActivityItem({ event: e, kitCode }: { event: EventRow; kitCode: string | null }) {
  const isNote = e.type === "order.note";
  const note = typeof e.payload.note === "string" ? e.payload.note : null;
  const who = e.actorLabel ?? e.actorType;
  return (
    <li className="flex gap-3">
      <Avatar label={who} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-ink">{who}</span>
          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">{ACTOR_CHIP[e.actorType] ?? e.actorType}</span>
          <span className="text-xs text-ink-subtle">· {formatDateTime(e.occurredAt)}</span>
        </p>
        <div className={cn("mt-1.5 rounded-lg border px-4 py-2.5 text-sm", isNote ? "border-line bg-surface text-ink" : "border-sky-100 bg-sky-50/60 text-ink")}>
          {isNote ? (
            <p className="whitespace-pre-wrap">{note}</p>
          ) : (
            <>
              <p>
                {describeEvent(e)}
                {kitCode ? <span className="ml-2 font-mono text-xs text-ink-muted">{kitCode}</span> : null}
              </p>
              {note ? <p className="mt-0.5 text-ink-muted">“{note}”</p> : null}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
