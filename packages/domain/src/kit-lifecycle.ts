/**
 * Kit lifecycle — the single source of truth for where a physical test kit is.
 *
 * Every status change in the system (admin UI, API, MCP, webhooks, crons) must
 * go through `assertKitTransition` so that the dashboard pipeline, customer
 * notifications, and audit trail can never disagree with each other.
 */

export const KIT_STATUSES = [
  "ordered",
  "label_created",
  "shipped",
  "delivered",
  "activated",
  "assigned",
  "sample_collected",
  "in_transit",
  "received_at_lab",
  "processing",
  "completed",
  "rerun",
  "cancelled",
] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];

/** Statuses shown, in order, in the dashboard "Order & Test Pipeline". */
export const PIPELINE_STATUSES = KIT_STATUSES.filter(
  (s): s is Exclude<KitStatus, "rerun" | "cancelled"> => s !== "rerun" && s !== "cancelled",
);

export const KIT_STATUS_META: Record<
  KitStatus,
  { label: string; description: string; tone: "neutral" | "info" | "progress" | "success" | "warning" | "danger" }
> = {
  ordered: { label: "Ordered", description: "Order received; kit not yet labelled.", tone: "neutral" },
  label_created: { label: "Label Created", description: "Outbound + return FedEx labels generated.", tone: "neutral" },
  shipped: { label: "Kit Shipped", description: "Kit handed to FedEx.", tone: "info" },
  delivered: { label: "Kit Delivered", description: "FedEx confirmed delivery to the customer.", tone: "info" },
  activated: { label: "Activated", description: "Customer scanned the kit QR code.", tone: "progress" },
  assigned: { label: "Assigned", description: "Kit linked to a pet.", tone: "progress" },
  sample_collected: { label: "Sample Collected", description: "Customer reported the sample collected.", tone: "progress" },
  in_transit: { label: "In Transit", description: "Return shipment on its way to the lab.", tone: "info" },
  received_at_lab: { label: "Received at Lab", description: "Lab scanned the kit in.", tone: "progress" },
  processing: { label: "Processing", description: "Sample is being run by the lab.", tone: "progress" },
  completed: { label: "Completed", description: "Results released to the customer.", tone: "success" },
  rerun: { label: "Rerun", description: "Lab result held; sample queued for rerun.", tone: "warning" },
  cancelled: { label: "Cancelled", description: "Kit voided (refund, lost, or replaced).", tone: "danger" },
};

/**
 * Allowed transitions. Customers frequently skip optional steps (e.g. they
 * never tap "sample collected"), so the lab can receive a kit from any
 * post-shipment state.
 */
const TRANSITIONS: Record<KitStatus, readonly KitStatus[]> = {
  // A customer can scan + register a kit before we've recorded it as shipped
  // (e.g. outbound tracking not connected, or a kit bought at a vet).
  // ShipStation / Defender ship straight from the Shopify order, so a kit can
  // go from Ordered to Shipped without us creating a label.
  ordered: ["label_created", "shipped", "activated", "cancelled"],
  label_created: ["shipped", "activated", "cancelled"],
  shipped: ["delivered", "activated", "received_at_lab", "cancelled"],
  delivered: ["activated", "received_at_lab", "cancelled"],
  activated: ["assigned", "received_at_lab", "cancelled"],
  assigned: ["sample_collected", "in_transit", "received_at_lab", "cancelled"],
  sample_collected: ["in_transit", "received_at_lab", "cancelled"],
  in_transit: ["received_at_lab", "cancelled"],
  received_at_lab: ["processing", "rerun"],
  processing: ["completed", "rerun"],
  rerun: ["processing", "cancelled"],
  completed: ["rerun"],
  cancelled: [],
};

/** Statuses counted as "in progress" on the dashboard (customer is waiting on us or the lab). */
export const IN_PROGRESS_STATUSES: readonly KitStatus[] = [
  "in_transit",
  "received_at_lab",
  "processing",
  "rerun",
];

/** Statuses in which a kit is still open (not completed or cancelled). */
export const OPEN_STATUSES: readonly KitStatus[] = KIT_STATUSES.filter(
  (s) => s !== "completed" && s !== "cancelled",
);

export function allowedNextStatuses(from: KitStatus): readonly KitStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionKit(from: KitStatus, to: KitStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class KitTransitionError extends Error {
  constructor(
    readonly from: KitStatus,
    readonly to: KitStatus,
  ) {
    super(
      from === to
        ? `Kit is already ${KIT_STATUS_META[from].label}.`
        : `A kit cannot move from ${KIT_STATUS_META[from].label} to ${KIT_STATUS_META[to].label}.`,
    );
    this.name = "KitTransitionError";
  }
}

export function assertKitTransition(from: KitStatus, to: KitStatus): void {
  if (!canTransitionKit(from, to)) throw new KitTransitionError(from, to);
}

/**
 * Customer email sent when a kit enters a status, if any. Matches what the old
 * app emailed customers; it never emailed when the kit
 * shipped out, so `shipped` has none.
 */
export const KIT_STATUS_EMAILS = ["kit_in_transit", "kit_received", "results_ready"] as const;
export type NotificationTemplate = (typeof KIT_STATUS_EMAILS)[number];

export function notificationForStatus(status: KitStatus): NotificationTemplate | null {
  switch (status) {
    case "in_transit":
      return "kit_in_transit";
    case "received_at_lab":
      return "kit_received";
    case "completed":
      return "results_ready";
    default:
      return null;
  }
}

/** Milestone timestamp column set when a kit enters a status. */
export function milestoneFieldFor(
  status: KitStatus,
): "shippedAt" | "activatedAt" | "receivedAt" | "completedAt" | null {
  switch (status) {
    case "shipped":
      return "shippedAt";
    case "activated":
      return "activatedAt";
    case "received_at_lab":
      return "receivedAt";
    case "completed":
      return "completedAt";
    default:
      return null;
  }
}
