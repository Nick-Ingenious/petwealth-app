import { schema as s, type DbOrTx } from "@petwealth/db";

export interface AuditEvent {
  entityType: "kit" | "order" | "customer" | "pet" | "staff" | "role";
  entityId: string;
  type: string;
  actorType: "staff" | "customer" | "system" | "integration";
  actorId?: string | null;
  actorLabel?: string | null;
  payload?: Record<string, unknown>;
}

/** Append to the audit log. Call inside the same transaction as the change. */
export async function recordEvent(db: DbOrTx, event: AuditEvent): Promise<void> {
  await db.insert(s.events).values({ ...event, payload: event.payload ?? {} });
}

/** Who made a change, as stored on an audit event. */
export type AuditActor = Pick<AuditEvent, "actorType" | "actorId" | "actorLabel">;

export const SHOPIFY_ACTOR: AuditActor = { actorType: "integration", actorId: "shopify", actorLabel: "Shopify" };
