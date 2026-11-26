/**
 * Email delivery.
 *
 *   services write a `notifications` row (channel "email", status "queued")
 *     └─► deliverQueuedEmails ──► render template ──► Resend ──► "sent" / "failed" / "skipped"
 *
 * The FedEx code email goes out right after the code is created. Kit status
 * emails (on the way, received, results ready) go out from the admin cron once
 * no kit has joined them for SETTLE_MS, so kits that change together (one
 * mailer, a batch of lab scans) share one email. The cron also retries
 * temporary failures. The cron also queues "mail your sample" reminders for
 * mailers FedEx hasn't picked up yet (queueMailSampleReminders). Each send has an idempotency key built from its
 * notification ids, so a retry after a timeout never emails the customer twice.
 */
import { createHash } from "node:crypto";
import { KIT_STATUS_EMAILS, type KitStatus, type NotificationTemplate } from "@petwealth/domain";
import { and, asc, desc, eq, getDb, gte, inArray, isNull, lte, schema as s } from "@petwealth/db";
import { EmailError, getEmailSender, type EmailMessage, type EmailSender } from "@petwealth/integrations/email";
import { kitStatusEmail } from "../emails/kit-status";
import { mailSampleReminderEmail } from "../emails/mail-sample-reminder";
import { returnLabelReadyEmail } from "../emails/return-label-ready";
import { portalUrl } from "../portal-url";
import { queueText } from "./texts";

/** Give up on temporary failures after a day; the email would be stale by then. */
const RETRY_FOR_MS = 24 * 60 * 60 * 1000;
/** Kit status emails wait this long after the newest kit joined, to combine kits that change together. */
export const SETTLE_MS = 2 * 60 * 1000;

/** The kit must still be in this status for the email to mention it (e.g. results pulled back for a rerun). */
const STILL_IN: Partial<Record<NotificationTemplate, KitStatus>> = { kit_in_transit: "in_transit", results_ready: "completed" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Template name for the "mail your sample" nudge. */
export const MAIL_SAMPLE_REMINDER = "mail_sample_reminder";
/** Days after the FedEx code was created to send each reminder, while FedEx hasn't picked the mailer up. */
export const MAIL_REMINDER_DAYS = [3, 10] as const;
/** At least this long between two reminders for the same mailer. */
const MIN_REMINDER_GAP_MS = 5 * DAY_MS;
/** Mailers older than this are left alone, so switching reminders on never emails about long-forgotten kits. */
const REMINDER_MAX_AGE_MS = 21 * DAY_MS;
/** A queued reminder that couldn't go out within this long is dropped instead of sent late. */
const REMINDER_STALE_MS = 2 * DAY_MS;
/** Kit statuses meaning "registered, not yet on its way to the lab". */
const AWAITING_PICKUP: KitStatus[] = ["assigned", "sample_collected"];

function isStatusEmail(template: string): template is NotificationTemplate {
  return (KIT_STATUS_EMAILS as readonly string[]).includes(template);
}

type NotificationRow = typeof s.notifications.$inferSelect;
type Rendered = { message: Omit<EmailMessage, "to" | "idempotencyKey"> } | { skip: string };

export { portalUrl };

async function returnShipmentIdForKit(kitId: string): Promise<string | undefined> {
  const [link] = await getDb()
    .select({ shipmentId: s.shipmentKits.shipmentId })
    .from(s.shipmentKits)
    .innerJoin(s.shipments, eq(s.shipments.id, s.shipmentKits.shipmentId))
    .where(and(eq(s.shipmentKits.kitId, kitId), eq(s.shipments.direction, "return")))
    .orderBy(desc(s.shipments.createdAt))
    .limit(1);
  return link?.shipmentId;
}

/** One email covering every kit in `rows` (same customer, same template). */
async function renderStatusEmail(template: NotificationTemplate, rows: NotificationRow[]): Promise<Rendered> {
  const db = getDb();
  const kitIds = [...new Set(rows.map((r) => r.kitId).filter((id): id is string => !!id))];
  if (!kitIds.length) return { skip: "No kit linked to this email" };
  const kits = (await db.query.kits.findMany({ where: inArray(s.kits.id, kitIds), with: { pet: true } }))
    .filter((k) => k.code && (!STILL_IN[template] || k.status === STILL_IN[template]))
    .sort((a, b) => a.code!.localeCompare(b.code!));
  if (!kits.length) return { skip: "The kit moved on before this email went out" };

  const customer = await db.query.customers.findFirst({ where: eq(s.customers.id, rows[0]!.customerId) });
  let trackingNumber: string | null = null;
  if (template === "kit_in_transit") {
    const shipmentId = await returnShipmentIdForKit(kits[0]!.id);
    const shipment = shipmentId ? await db.query.shipments.findFirst({ where: eq(s.shipments.id, shipmentId) }) : undefined;
    trackingNumber = shipment?.trackingNumber ?? null;
  }
  const email = kitStatusEmail(template, {
    firstName: customer?.firstName ?? null,
    kits: kits.map((k) => ({ code: k.code!, petName: k.pet?.name ?? null, panel: k.panel })),
    kitUrl: `${portalUrl()}/kits/${encodeURIComponent(kits[0]!.code!)}`,
    trackingNumber,
  });
  return { message: { subject: email.subject, html: email.html, text: email.text } };
}

async function render(rows: NotificationRow[], now: number): Promise<Rendered> {
  const db = getDb();
  const row = rows[0]!;
  if (isStatusEmail(row.template)) return renderStatusEmail(row.template, rows);
  if (row.template === MAIL_SAMPLE_REMINDER) return renderMailSampleReminder(row, now);
  if (row.template === "return_label_ready") {
    // The mailer this email is about: the one holding row.kitId, else the customer's latest.
    let shipmentId: string | undefined;
    if (row.kitId) {
      shipmentId = await returnShipmentIdForKit(row.kitId);
    } else {
      const latest = await db.query.shipments.findFirst({
        where: and(eq(s.shipments.customerId, row.customerId), eq(s.shipments.direction, "return")),
        orderBy: desc(s.shipments.createdAt),
      });
      shipmentId = latest?.id;
    }
    const shipment = shipmentId
      ? await db.query.shipments.findFirst({
          where: eq(s.shipments.id, shipmentId),
          with: { kits: { with: { kit: { with: { pet: true } } } }, label: true },
        })
      : undefined;
    if (!shipment?.rmaNumber) return { skip: "No return mailer found for this email" };
    if (!shipment.label) return { skip: "The mailer has no FedEx code yet" };

    const customer = await db.query.customers.findFirst({ where: eq(s.customers.id, row.customerId) });
    const kits = shipment.kits.map((sk) => ({ code: sk.kit.code ?? "", petName: sk.kit.pet?.name ?? null, panel: sk.kit.panel }));
    const first = kits.find((k) => k.code);
    const email = returnLabelReadyEmail({
      firstName: customer?.firstName ?? null,
      kits,
      rmaNumber: shipment.rmaNumber,
      label: {
        format: shipment.labelFormat === "pdf" ? "pdf" : "qr_png",
        mimeType: shipment.label.mimeType,
        contentBase64: shipment.label.contentBase64,
      },
      kitUrl: first ? `${portalUrl()}/kits/${encodeURIComponent(first.code)}` : portalUrl(),
    });
    return { message: { subject: email.subject, html: email.html, text: email.text, attachments: email.attachments } };
  }
  return { skip: `No email template for "${row.template}"` };
}

async function renderMailSampleReminder(row: NotificationRow, now: number): Promise<Rendered> {
  const db = getDb();
  if (now - row.createdAt.getTime() > REMINDER_STALE_MS) return { skip: "Reminder is too old to send" };
  const shipmentId = row.kitId ? await returnShipmentIdForKit(row.kitId) : undefined;
  const shipment = shipmentId
    ? await db.query.shipments.findFirst({
        where: eq(s.shipments.id, shipmentId),
        with: { kits: { with: { kit: { with: { pet: true } } } }, label: true },
      })
    : undefined;
  if (!shipment?.rmaNumber || !shipment.label) return { skip: "No mailer with a FedEx code for this reminder" };
  if (shipment.status !== "label_created" || shipment.kits.some((sk) => !AWAITING_PICKUP.includes(sk.kit.status))) {
    return { skip: "The sample is already on its way" };
  }
  const earlier = await db
    .select({ id: s.notifications.id })
    .from(s.notifications)
    .where(
      and(eq(s.notifications.kitId, row.kitId!), eq(s.notifications.template, MAIL_SAMPLE_REMINDER), eq(s.notifications.channel, "email"), lte(s.notifications.createdAt, row.createdAt)),
    );
  const customer = await db.query.customers.findFirst({ where: eq(s.customers.id, row.customerId) });
  const kits = shipment.kits.map((sk) => ({ code: sk.kit.code ?? "", petName: sk.kit.pet?.name ?? null, panel: sk.kit.panel }));
  const first = kits.find((k) => k.code);
  const email = mailSampleReminderEmail({
    reminder: earlier.length > 1 ? 2 : 1,
    firstName: customer?.firstName ?? null,
    kits,
    rmaNumber: shipment.rmaNumber,
    label: {
      format: shipment.labelFormat === "pdf" ? "pdf" : "qr_png",
      mimeType: shipment.label.mimeType,
      contentBase64: shipment.label.contentBase64,
    },
    kitUrl: first ? `${portalUrl()}/kits/${encodeURIComponent(first.code)}` : portalUrl(),
  });
  return { message: { subject: email.subject, html: email.html, text: email.text, attachments: email.attachments } };
}

/**
 * Queue "mail your sample" reminders: one at 3 days and one at 10 days after
 * a mailer's FedEx code was created, while FedEx still hasn't picked it up.
 * Safe to run as often as you like; each mailer gets at most two reminders.
 */
export async function queueMailSampleReminders(opts: { now?: () => number; email?: boolean; sms?: boolean } = {}): Promise<{ queued: number }> {
  const wantEmail = opts.email ?? true;
  const wantSms = opts.sms ?? true;
  const db = getDb();
  const now = (opts.now ?? Date.now)();
  const candidates = await db
    .select({ id: s.shipments.id, customerId: s.shipments.customerId, createdAt: s.shipments.createdAt })
    .from(s.shipments)
    .innerJoin(s.customers, eq(s.customers.id, s.shipments.customerId))
    .where(
      and(
        eq(s.shipments.direction, "return"),
        eq(s.shipments.status, "label_created"),
        isNull(s.customers.deletedAt),
        lte(s.shipments.createdAt, new Date(now - MAIL_REMINDER_DAYS[0] * DAY_MS)),
        gte(s.shipments.createdAt, new Date(now - REMINDER_MAX_AGE_MS)),
      ),
    );

  let queued = 0;
  for (const shipment of candidates) {
    const kits = await db
      .select({ id: s.kits.id, status: s.kits.status })
      .from(s.shipmentKits)
      .innerJoin(s.kits, eq(s.kits.id, s.shipmentKits.kitId))
      .where(eq(s.shipmentKits.shipmentId, shipment.id));
    if (!kits.length || kits.some((k) => !AWAITING_PICKUP.includes(k.status))) continue;
    // Reminders hang off the mailer's first kit (by id), so every run finds the same ones.
    const anchor = kits.map((k) => k.id).sort()[0]!;
    // One reminder round = the email and text queued together (same time).
    const earlier = await db
      .select({ createdAt: s.notifications.createdAt })
      .from(s.notifications)
      .where(and(eq(s.notifications.template, MAIL_SAMPLE_REMINDER), inArray(s.notifications.kitId, kits.map((k) => k.id))))
      .orderBy(desc(s.notifications.createdAt));
    const rounds = [...new Set(earlier.map((r) => r.createdAt.getTime()))];
    const dueAfterDays = MAIL_REMINDER_DAYS[rounds.length];
    if (dueAfterDays === undefined) continue;
    if (now - shipment.createdAt.getTime() < dueAfterDays * DAY_MS) continue;
    if (rounds[0] !== undefined && now - rounds[0] < MIN_REMINDER_GAP_MS) continue;
    const row = { customerId: shipment.customerId!, kitId: anchor, template: MAIL_SAMPLE_REMINDER, createdAt: new Date(now) } as const;
    let any = false;
    if (wantEmail) {
      await db.insert(s.notifications).values({ ...row, channel: "email" });
      any = true;
    }
    if (wantSms) any = (await queueText(db, row)) || any;
    if (any) queued++;
  }
  return { queued };
}

export type DeliveryResult = { sent: number; failed: number; skipped: number; retrying: number; waiting: number };

/** Same rows, same key: "notification-<id>" for one, a hash of the sorted ids for several. */
function idempotencyKey(rows: NotificationRow[]): string {
  if (rows.length === 1) return `notification-${rows[0]!.id}`;
  const ids = rows.map((r) => r.id).sort().join(",");
  return `notifications-${createHash("sha256").update(ids).digest("hex").slice(0, 32)}`;
}

/** Kit status emails group by customer + template; everything else sends on its own. */
function groupRows(rows: NotificationRow[]): NotificationRow[][] {
  const groups = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const key = isStatusEmail(row.template) && row.kitId ? `${row.customerId}:${row.template}` : row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

/** Send queued emails (all of them, or just `ids`). Never throws for a single bad email. */
export async function deliverQueuedEmails(opts: { sender?: EmailSender; ids?: string[]; limit?: number; now?: () => number } = {}): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, failed: 0, skipped: 0, retrying: 0, waiting: 0 };
  if (opts.ids && opts.ids.length === 0) return result;
  const db = getDb();
  const now = opts.now ?? Date.now;
  const sender = opts.sender ?? getEmailSender();
  const rows = await db
    .select()
    .from(s.notifications)
    .where(
      and(
        eq(s.notifications.channel, "email"),
        eq(s.notifications.status, "queued"),
        opts.ids ? inArray(s.notifications.id, opts.ids) : undefined,
      ),
    )
    .orderBy(asc(s.notifications.createdAt))
    .limit(opts.limit ?? 50);

  for (const group of groupRows(rows)) {
    const first = group[0]!;
    const newest = Math.max(...group.map((r) => r.createdAt.getTime()));
    if (isStatusEmail(first.template) && now() - newest < SETTLE_MS) {
      result.waiting += group.length; // more kits may still join; the next run sends it
      continue;
    }
    const ids = group.map((r) => r.id);
    // Only touch rows still queued, so two runs at once can't both record a result.
    const settle = (set: Partial<typeof s.notifications.$inferInsert>) =>
      db.update(s.notifications).set(set).where(and(inArray(s.notifications.id, ids), eq(s.notifications.status, "queued")));

    const customer = await db.query.customers.findFirst({ where: eq(s.customers.id, first.customerId) });
    if (!customer?.email) {
      await settle({ status: "skipped", error: "Customer has no email address" });
      result.skipped += group.length;
      continue;
    }
    try {
      const rendered = await render(group, now());
      if ("skip" in rendered) {
        await settle({ status: "skipped", error: rendered.skip });
        result.skipped += group.length;
        continue;
      }
      const { id } = await sender.send({ ...rendered.message, to: customer.email, idempotencyKey: idempotencyKey(group) });
      await settle({ status: "sent", providerMessageId: id, sentAt: new Date(now()), error: null });
      result.sent += group.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retryable = e instanceof EmailError ? e.retryable : false;
      if (!(e instanceof EmailError)) console.error("[email] unexpected error", e);
      if (retryable && now() - first.createdAt.getTime() < RETRY_FOR_MS) {
        await settle({ error: message }); // stays queued; the cron tries again
        result.retrying += group.length;
      } else {
        await settle({ status: "failed", error: message });
        result.failed += group.length;
      }
    }
  }
  return result;
}
