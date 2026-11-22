import { KIT_STATUS_META, KIT_STATUSES, type KitStatus } from "@petwealth/domain";
import { formatDateTime } from "@/lib/format";

export interface EventRow {
  id: string;
  entityId: string;
  type: string;
  actorType: string;
  actorLabel: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

const isStatus = (v: unknown): v is KitStatus => typeof v === "string" && (KIT_STATUSES as readonly string[]).includes(v);

const LABELS: Record<string, string> = {
  "order.created": "Order placed",
  "order.cancelled": "Order cancelled",
  "order.needs_attention": "⚠ Needs attention",
  "order.note": "Note added",
  "kit.created": "Kit ordered",
  "customer.updated": "Customer details updated",
  "pet.updated": "Pet details updated",
};

export function describeEvent(e: EventRow): string {
  if (e.type === "kit.status_changed" && isStatus(e.payload.to)) {
    const pet = typeof e.payload.petName === "string" ? ` (${e.payload.petName})` : "";
    return `${KIT_STATUS_META[e.payload.to].label}${pet}`;
  }
  return LABELS[e.type] ?? e.type;
}

/** Audit timeline (newest first) built from the `events` table. */
export function Timeline({ events, kitCodes }: { events: EventRow[]; kitCodes?: Map<string, string | null> }) {
  if (!events.length) return <p className="text-sm text-ink-muted">No activity yet.</p>;
  return (
    <ol className="relative ml-1 space-y-5 border-l border-line pl-6">
      {events.map((e) => {
        const code = kitCodes?.get(e.entityId);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[29px] top-1.5 size-2.5 rounded-full bg-brand-500 ring-4 ring-surface" aria-hidden />
            <p className="text-sm font-medium text-ink">
              {describeEvent(e)}
              {code ? <span className="ml-2 font-mono text-xs text-ink-muted">{code}</span> : null}
            </p>
            <p className="text-xs text-ink-subtle">
              {formatDateTime(e.occurredAt)} · {e.actorLabel ?? e.actorType}
              {typeof e.payload.note === "string" ? ` — “${e.payload.note}”` : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
