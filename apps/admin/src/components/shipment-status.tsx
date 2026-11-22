import { Badge, type Tone } from "@petwealth/ui";

const META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Creating label", tone: "neutral" },
  failed: { label: "Label failed", tone: "danger" },
  label_created: { label: "Code ready", tone: "info" },
  in_transit: { label: "In transit", tone: "progress" },
  delivered: { label: "Delivered", tone: "success" },
  exception: { label: "FedEx exception", tone: "danger" },
  voided: { label: "Voided", tone: "neutral" },
};

export function ShipmentStatusBadge({ status }: { status: string }) {
  const m = META[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
