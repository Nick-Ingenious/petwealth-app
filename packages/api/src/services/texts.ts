/**
 * Customer text messages (SMS), alongside the emails.
 *
 *   kit status change / reminder ──► notifications row (channel "sms")
 *     └─► deliverQueuedTexts (notifications cron) ──► Twilio ──► "sent"
 *           └─► Twilio status webhook ──► "delivered" / "failed"
 *
 * Only for customers who opted in and have a US mobile number, re-checked at
 * send time. Kit texts wait a couple of minutes so kits that change together
 * share one text, go out only between 9am and 8pm local time, and are
 * dropped after a day rather than sent late. STOP and START replies come
 * back through the Twilio webhook (handleTwilioWebhook).
 */
import { randomUUID } from "node:crypto";
import { type KitStatus } from "@petwealth/domain";
import { and, asc, desc, eq, getDb, inArray, isNull, schema as s, sql, type DbOrTx } from "@petwealth/db";
import { SmsError, smsKeyword, toUsE164, type SmsSender } from "@petwealth/integrations/sms";
import { recordEvent, type AuditActor } from "../audit";
import { portalUrl } from "../portal-url";
import { canTextNow } from "../sms/quiet-hours";
import { kitText, SMS_TEMPLATES, type SmsTemplate } from "../sms/kit-texts";

/** Kit texts wait this long after the newest kit joined, so kits that change together share a text. */
export const TEXT_SETTLE_MS = 2 * 60 * 1000;
/** A text that couldn't go out within a day is dropped: the news is stale by then. */
export const TEXT_STALE_MS = 24 * 60 * 60 * 1000;

const STATUS_TEXTS: SmsTemplate[] = ["kit_in_transit", "kit_received", "results_ready"];
/** The kit must still be in this status for the text to mention it. */
const STILL_IN: Partial<Record<SmsTemplate, KitStatus[]>> = {
  kit_in_transit: ["in_transit"],
  results_ready: ["completed"],
  mail_sample_reminder: ["assigned", "sample_collected"],
};

export const TWILIO_ACTOR: AuditActor = { actorType: "integration", actorId: "twilio", actorLabel: "Twilio" };

const isTemplate = (t: string): t is SmsTemplate => (SMS_TEMPLATES as readonly string[]).includes(t);

/**
 * Queue a text next to an email, if this customer gets texts. Call inside the
 * same transaction as the change it's about.
 */
export async function queueText(db: DbOrTx, row: { customerId: string; kitId: string | null; template: SmsTemplate; createdAt?: Date }): Promise<boolean> {
  const [c] = await db
    .select({ smsOptIn: s.customers.smsOptIn, phone: s.customers.phone, deletedAt: s.customers.deletedAt })
    .from(s.customers)
    .where(eq(s.customers.id, row.customerId));
  if (!c || c.deletedAt || !c.smsOptIn || !toUsE164(c.phone)) return false;
  await db.insert(s.notifications).values({ ...row, channel: "sms" });
  return true;
}

type Row = typeof s.notifications.$inferSelect;

/** Kit texts group by customer + template; reminders send on their own. */
function groupRows(rows: Row[]): Row[][] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = STATUS_TEXTS.includes(row.template as SmsTemplate) && row.kitId ? `${row.customerId}:${row.template}` : row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

async function render(rows: Row[]): Promise<{ body: string } | { skip: string }> {
  const db = getDb();
  const template = rows[0]!.template;
  if (!isTemplate(template)) return { skip: `No text template for "${template}"` };
  const kitIds = [...new Set(rows.map((r) => r.kitId).filter((id): id is string => !!id))];
  if (!kitIds.length) return { skip: "No kit linked to this text" };

  let kits = await db.query.kits.findMany({ where: inArray(s.kits.id, kitIds), with: { pet: true } });
  let printedLabel = false;
  if (template === "mail_sample_reminder") {
    // The reminder covers the whole mailer, and only while FedEx hasn't picked it up.
    const [link] = await db
      .select({ shipmentId: s.shipmentKits.shipmentId, status: s.shipments.status, labelFormat: s.shipments.labelFormat })
      .from(s.shipmentKits)
      .innerJoin(s.shipments, eq(s.shipments.id, s.shipmentKits.shipmentId))
      .where(and(eq(s.shipmentKits.kitId, kitIds[0]!), eq(s.shipments.direction, "return")))
      .orderBy(desc(s.shipments.createdAt))
      .limit(1);
    if (!link || link.status !== "label_created") return { skip: "The sample is already on its way" };
    printedLabel = link.labelFormat === "pdf";
    const all = await db.select({ kitId: s.shipmentKits.kitId }).from(s.shipmentKits).where(eq(s.shipmentKits.shipmentId, link.shipmentId));
    kits = await db.query.kits.findMany({ where: inArray(s.kits.id, all.map((k) => k.kitId)), with: { pet: true } });
    if (kits.some((k) => !STILL_IN.mail_sample_reminder!.includes(k.status))) return { skip: "The sample is already on its way" };
  } else if (STILL_IN[template]) {
    kits = kits.filter((k) => STILL_IN[template]!.includes(k.status));
  }
  kits = kits.filter((k) => k.code).sort((a, b) => a.code!.localeCompare(b.code!));
  if (!kits.length) return { skip: "The kit moved on before this text went out" };
  const url = `${portalUrl()}/kits/${encodeURIComponent(kits[0]!.code!)}`;
  return { body: kitText(template, { kits: kits.map((k) => ({ petName: k.pet?.name ?? null })), url, printedLabel }) };
}

export type TextDeliveryResult = { sent: number; failed: number; skipped: number; retrying: number; waiting: number };

/** Send queued texts (all of them, or just `ids`). Never throws for a single bad text. */
export async function deliverQueuedTexts(opts: { sender: SmsSender; ids?: string[]; limit?: number; now?: () => number }): Promise<TextDeliveryResult> {
  const result: TextDeliveryResult = { sent: 0, failed: 0, skipped: 0, retrying: 0, waiting: 0 };
  if (opts.ids && opts.ids.length === 0) return result;
  const db = getDb();
  const now = opts.now ?? Date.now;
  const rows = await db
    .select()
    .from(s.notifications)
    .where(
      and(
        eq(s.notifications.channel, "sms"),
        eq(s.notifications.status, "queued"),
        isNull(s.notifications.providerMessageId),
        opts.ids ? inArray(s.notifications.id, opts.ids) : undefined,
      ),
    )
    .orderBy(asc(s.notifications.createdAt))
    .limit(opts.limit ?? 100);

  for (const group of groupRows(rows)) {
    const first = group[0]!;
    const ids = group.map((r) => r.id);
    const newest = Math.max(...group.map((r) => r.createdAt.getTime()));
    const settle = (set: Partial<typeof s.notifications.$inferInsert>) =>
      db.update(s.notifications).set(set).where(and(inArray(s.notifications.id, ids), eq(s.notifications.status, "queued")));
    const skip = async (why: string) => {
      await settle({ status: "skipped", error: why, providerMessageId: null });
      result.skipped += group.length;
    };

    if (now() - first.createdAt.getTime() > TEXT_STALE_MS) {
      await skip("Too old to text");
      continue;
    }
    if (STATUS_TEXTS.includes(first.template as SmsTemplate) && now() - newest < TEXT_SETTLE_MS) {
      result.waiting += group.length; // more kits may still join; the next run sends it
      continue;
    }

    const customer = await db.query.customers.findFirst({ where: eq(s.customers.id, first.customerId) });
    const to = toUsE164(customer?.phone);
    if (!customer || customer.deletedAt) {
      await skip("Customer account is closed");
      continue;
    }
    if (!customer.smsOptIn) {
      await skip("Customer turned off texts");
      continue;
    }
    if (!to) {
      await skip("No US mobile number on file");
      continue;
    }
    const address = await db.query.addresses.findFirst({ where: and(eq(s.addresses.customerId, customer.id), eq(s.addresses.isDefault, true)) });
    if (!canTextNow(address?.region, new Date(now()))) {
      result.waiting += group.length; // quiet hours; a later run sends it
      continue;
    }

    // Claim the rows, so two runs at once can't both text (Twilio has no idempotency key).
    const claim = `claimed:${randomUUID()}`;
    const claimed = await db
      .update(s.notifications)
      .set({ providerMessageId: claim })
      .where(and(inArray(s.notifications.id, ids), eq(s.notifications.status, "queued"), isNull(s.notifications.providerMessageId)))
      .returning({ id: s.notifications.id });
    if (claimed.length !== ids.length) {
      await db.update(s.notifications).set({ providerMessageId: null }).where(eq(s.notifications.providerMessageId, claim));
      continue;
    }
    const claimedRows = () => and(eq(s.notifications.providerMessageId, claim), eq(s.notifications.status, "queued"));

    try {
      const rendered = await render(group);
      if ("skip" in rendered) {
        await db.update(s.notifications).set({ status: "skipped", error: rendered.skip, providerMessageId: null }).where(claimedRows());
        result.skipped += group.length;
        continue;
      }
      const { id } = await opts.sender.send({ to, body: rendered.body });
      await db.update(s.notifications).set({ status: "sent", providerMessageId: id, sentAt: new Date(now()), error: null }).where(claimedRows());
      result.sent += group.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!(e instanceof SmsError)) console.error("[sms] unexpected error", e);
      if (e instanceof SmsError && e.retryable) {
        await db.update(s.notifications).set({ error: message, providerMessageId: null }).where(claimedRows()); // the next run tries again
        result.retrying += group.length;
      } else {
        await db.update(s.notifications).set({ status: "failed", error: message, providerMessageId: null }).where(claimedRows());
        result.failed += group.length;
      }
    }
  }
  return result;
}

// ── Twilio webhook: replies and delivery receipts ───────────────────────

/** Customers with this number, whatever format they typed it in. */
async function customersByPhone(e164: string) {
  const national = e164.replace(/^\+1/, "");
  return getDb()
    .select({ id: s.customers.id, smsOptIn: s.customers.smsOptIn })
    .from(s.customers)
    .where(and(isNull(s.customers.deletedAt), sql`right(regexp_replace(coalesce(${s.customers.phone}, ''), '\\D', '', 'g'), 10) = ${national}`));
}

export type TwilioWebhookOutcome = "opted_out" | "opted_in" | "help" | "status_updated" | "ignored";

/**
 * Twilio calls the same URL for replies (Body) and for delivery receipts
 * (MessageStatus). STOP and START change the customer's text alerts setting;
 * Twilio itself sends the confirmation text (Advanced Opt-Out).
 */
export async function handleTwilioWebhook(params: Record<string, string>): Promise<{ outcome: TwilioWebhookOutcome; customers?: number }> {
  const db = getDb();
  if (params.MessageStatus && params.MessageSid && params.Body === undefined) {
    const status = params.MessageStatus;
    const failed = status === "failed" || status === "undelivered";
    if (status !== "delivered" && !failed) return { outcome: "ignored" };
    await db
      .update(s.notifications)
      .set(failed ? { status: "failed", error: `Twilio: ${status}${params.ErrorCode ? ` (error ${params.ErrorCode})` : ""}` } : { status: "delivered" })
      .where(and(eq(s.notifications.channel, "sms"), eq(s.notifications.providerMessageId, params.MessageSid)));
    return { outcome: "status_updated" };
  }

  const keyword = smsKeyword(params.Body);
  const from = toUsE164(params.From);
  if (!keyword || !from) return { outcome: "ignored" };
  if (keyword === "help") return { outcome: "help" };

  const optIn = keyword === "start";
  const matches = await customersByPhone(from);
  for (const c of matches) {
    if (c.smsOptIn === optIn) continue;
    await db.transaction(async (tx) => {
      await tx.update(s.customers).set({ smsOptIn: optIn }).where(eq(s.customers.id, c.id));
      await recordEvent(tx, {
        entityType: "customer",
        entityId: c.id,
        type: optIn ? "customer.sms_opted_in" : "customer.sms_opted_out",
        ...TWILIO_ACTOR,
        payload: { via: "sms_reply" },
      });
      // Nothing more goes out after STOP, even if it was already queued.
      if (!optIn) {
        await tx
          .update(s.notifications)
          .set({ status: "skipped", error: "Customer replied STOP" })
          .where(and(eq(s.notifications.customerId, c.id), eq(s.notifications.channel, "sms"), eq(s.notifications.status, "queued")));
      }
    });
  }
  return { outcome: optIn ? "opted_in" : "opted_out", customers: matches.length };
}
