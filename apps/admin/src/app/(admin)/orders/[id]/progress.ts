import { PIPELINE_STATUSES, type KitStatus } from "@petwealth/domain";

/**
 * Order and test progress for the order detail page, derived from the kits'
 * statuses and their `kit.status_changed` events. With several kits (a
 * Complete order ships three), a step counts as reached only once every
 * non-cancelled kit has reached it, and its date is when the last one did.
 */

export type StepKey = "ordered" | "shipped" | "delivered" | "registered" | "mailed" | "received" | "processing" | "results";

export interface StepDef {
  key: StepKey;
  label: string;
  /** First kit status that counts as having reached this step. */
  from: KitStatus;
}

export const ORDER_STEPS: StepDef[] = [
  { key: "ordered", label: "Ordered", from: "ordered" },
  { key: "shipped", label: "Kit Shipped", from: "shipped" },
  { key: "delivered", label: "Kit Delivered", from: "delivered" },
];

export const TEST_STEPS: StepDef[] = [
  { key: "registered", label: "QR Registered", from: "activated" },
  { key: "mailed", label: "Sample Mailed", from: "in_transit" },
  { key: "received", label: "Sample Received", from: "received_at_lab" },
  { key: "processing", label: "Processing", from: "processing" },
  { key: "results", label: "Results Ready", from: "completed" },
];

/** Position in the happy path. A rerun is still being processed by the lab. */
function rank(status: KitStatus): number {
  if (status === "rerun") return PIPELINE_STATUSES.indexOf("processing");
  if (status === "cancelled") return -1;
  return PIPELINE_STATUSES.indexOf(status);
}

export interface StepState extends StepDef {
  done: boolean;
  /** The furthest step reached — highlighted in the stepper. */
  current: boolean;
  at: Date | null;
}

interface KitLike {
  id: string;
  status: KitStatus;
}
interface EventLike {
  entityId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export function computeSteps(steps: StepDef[], kits: KitLike[], events: EventLike[], placedAt: Date): StepState[] {
  const active = kits.filter((k) => k.status !== "cancelled");
  const level = active.length ? Math.min(...active.map((k) => rank(k.status))) : -1;

  // Every status each kit has entered, with when.
  const reached = new Map<string, { rank: number; at: number }[]>();
  for (const e of events) {
    if (e.type !== "kit.status_changed" || typeof e.payload.to !== "string") continue;
    const list = reached.get(e.entityId) ?? [];
    list.push({ rank: rank(e.payload.to as KitStatus), at: new Date(e.occurredAt).getTime() });
    reached.set(e.entityId, list);
  }

  const states: StepState[] = steps.map((step) => {
    const r = rank(step.from);
    const done = level >= r;
    let at: Date | null = null;
    if (done && step.key === "ordered") at = placedAt;
    else if (done) {
      const perKit = active.map((k) => {
        const times = (reached.get(k.id) ?? []).filter((x) => x.rank >= r).map((x) => x.at);
        return times.length ? Math.min(...times) : null;
      });
      // Older data may lack events; the step still shows as done, just without a date.
      if (perKit.every((t): t is number => t !== null)) at = new Date(Math.max(...perKit));
    }
    return { ...step, done, current: false, at };
  });
  const last = states.findLastIndex((s) => s.done);
  if (last >= 0) states[last]!.current = true;
  return states;
}
